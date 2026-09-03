import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from '@/app/page';
import { brl, customer, deferred, report, suspiciousOrder } from './factories';

/**
 * Integração da página com `fetch` dublado. Cobre a lógica que mais quebrou
 * durante o desenvolvimento: qual fonte alimenta a carga inicial, o que o
 * filtro de período faz, e o descarte de respostas fora de ordem.
 */

const RELATORIO_COMPLETO = report(
  [
    customer({ customer_id: 1, nome: 'Cliente_1', categoria: 'VIP', total_gasto_antes_desconto: 1000, desconto_valor: 100, total_gasto_apos_desconto: 900, pedidos_suspeitos: [suspiciousOrder()] }),
    customer({ customer_id: 2, nome: 'Cliente_2', categoria: 'Regular', total_pedidos: 3, total_gasto_antes_desconto: 600, desconto_aplicado_percentual: 5, desconto_valor: 30, total_gasto_apos_desconto: 570 }),
  ],
  { data_inicial: null, data_final: null },
);

const RELATORIO_JANEIRO = report(
  [customer({ customer_id: 1, nome: 'Cliente_1', total_pedidos: 5, total_gasto_antes_desconto: 400, desconto_valor: 40, total_gasto_apos_desconto: 360 })],
  { data_inicial: '2025-01-01', data_final: '2025-01-31' },
);

type Rota = { status?: number; body: unknown };

/** Instala um `fetch` dublado que responde por rota. */
function mockFetch(rotas: Record<string, Rota | (() => Promise<Rota>)>) {
  const calls: string[] = [];

  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    const chave = Object.keys(rotas).find((k) => url.startsWith(k));
    if (!chave) throw new Error(`rota não dublada: ${url}`);

    const rota = rotas[chave]!;
    const { status = 200, body } = typeof rota === 'function' ? await rota() : rota;

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });

  vi.stubGlobal('fetch', impl);
  return { calls };
}

const cardValue = (rotulo: RegExp) =>
  brl(screen.getByText(rotulo).parentElement?.querySelector('p')?.textContent);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DashboardPage — carga inicial', () => {
  it('lê o report.json, que é o arquivo produzido pela CLI', async () => {
    const { calls } = mockFetch({ '/report.json': { body: RELATORIO_COMPLETO } });

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Cliente_1')).toBeInTheDocument());
    // A API não deve ser consultada quando o arquivo responde.
    expect(calls.some((u) => u.includes('/api/report'))).toBe(false);
    expect(screen.getByText(/fonte: report\.json/)).toBeInTheDocument();
  });

  it('inicializa os campos de data com o período declarado pelo arquivo', async () => {
    mockFetch({ '/report.json': { body: RELATORIO_JANEIRO } });

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Cliente_1')).toBeInTheDocument());
    expect(screen.getByLabelText('Período — de')).toHaveValue('2025-01-01');
    expect(screen.getByLabelText('até')).toHaveValue('2025-01-31');
    expect(screen.getByText('01/01/2025 – 31/01/2025')).toBeInTheDocument();
  });

  it('omite o indicador de período quando o relatório rodou sem filtro', async () => {
    mockFetch({ '/report.json': { body: RELATORIO_COMPLETO } });

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Cliente_1')).toBeInTheDocument());
    expect(screen.queryByText('Período analisado')).not.toBeInTheDocument();
  });

  it('agrega os cards a partir do relatório carregado', async () => {
    mockFetch({ '/report.json': { body: RELATORIO_COMPLETO } });

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Cliente_1')).toBeInTheDocument());
    expect(cardValue(/volume bruto/i)).toBe('R$ 1.600,00');
    expect(cardValue(/volume líquido/i)).toBe('R$ 1.470,00');
    expect(cardValue(/transações suspeitas/i)).toBe('1');
  });

  it('recorre à API quando o report.json ainda não foi gerado', async () => {
    const { calls } = mockFetch({
      '/report.json': { status: 404, body: null },
      '/api/report': { body: RELATORIO_COMPLETO },
    });

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText(/fonte: analyzer\.py/)).toBeInTheDocument());
    expect(calls.filter((u) => u.includes('/api/report'))).toHaveLength(1);
  });

  it('mostra o comando de geração quando arquivo e API falham', async () => {
    mockFetch({
      '/report.json': { status: 404, body: null },
      '/api/report': { status: 503, body: { error: 'python3 não encontrado' } },
    });

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText(/relatório não carregado/i)).toBeInTheDocument());
    expect(screen.getByText(/python3 backend\/analyzer\.py --output/)).toBeInTheDocument();
    expect(screen.getByText(/python3 não encontrado/)).toBeInTheDocument();
  });

  it('recusa um report.json fora do contrato em vez de renderizar dado inválido', async () => {
    mockFetch({
      '/report.json': { body: [{ id: 1, name: 'Cliente_1', tier: 'VIP' }] },
      '/api/report': { status: 503, body: { error: 'indisponível' } },
    });

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText(/relatório não carregado/i)).toBeInTheDocument());
    expect(screen.getByText(/customers\.json/)).toBeInTheDocument();
  });
});

describe('DashboardPage — filtro de período', () => {
  it('reprocessa no backend com as datas na query e atualiza os cards', async () => {
    const { calls } = mockFetch({
      '/report.json': { body: RELATORIO_COMPLETO },
      '/api/report': { body: RELATORIO_JANEIRO },
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Cliente_2')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Período — de'), '2025-01-01');

    await waitFor(() => expect(cardValue(/volume bruto/i)).toBe('R$ 400,00'));
    const chamada = calls.find((u) => u.includes('/api/report'))!;
    expect(chamada).toContain('start=2025-01-01');
    expect(screen.getByText(/fonte: analyzer\.py/)).toBeInTheDocument();
  });

  it('não envia parâmetro para um limite vazio', async () => {
    const { calls } = mockFetch({
      '/report.json': { body: RELATORIO_JANEIRO },
      '/api/report': { body: RELATORIO_COMPLETO },
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Cliente_1')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /limpar período/i }));

    await waitFor(() => expect(calls.some((u) => u.includes('/api/report'))).toBe(true));
    const chamada = calls.find((u) => u.includes('/api/report'))!;
    expect(chamada).not.toContain('start=');
    expect(chamada).not.toContain('end=');
  });

  it('preserva os dados na tela quando o reprocessamento falha', async () => {
    mockFetch({
      '/report.json': { body: RELATORIO_COMPLETO },
      '/api/report': { status: 400, body: { error: 'o intervalo está invertido' } },
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Cliente_2')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Período — de'), '2025-03-01');

    await waitFor(() => expect(screen.getByText(/período não aplicado/i)).toBeInTheDocument());
    expect(screen.getByText(/intervalo está invertido/)).toBeInTheDocument();
    // Os dados anteriores continuam visíveis: a falha não custa o que já estava carregado.
    expect(screen.getByText('Cliente_2')).toBeInTheDocument();
    expect(cardValue(/volume bruto/i)).toBe('R$ 1.600,00');
  });

  it('descarta a resposta da carga inicial superada por um filtro de período', async () => {
    /**
     * Corrida real e alcançável: nada impede mudar o período enquanto o
     * `report.json` inicial ainda está no ar. Se o arquivo responder depois da
     * API, o resultado antigo não pode vencer na tela — é o que o contador de
     * requisição em `useReport` protege.
     */
    const arquivo = deferred();

    mockFetch({
      '/report.json': async () => {
        await arquivo.promise;
        return { body: report([customer({ nome: 'DO_ARQUIVO' })]) };
      },
      '/api/report': { body: report([customer({ nome: 'DA_API' })]) },
    });

    render(<DashboardPage />);

    // Com o arquivo pendente, muda o período: a API responde primeiro.
    await userEvent.type(screen.getByLabelText('Período — de'), '2025-01-01');
    await waitFor(() => expect(screen.getByText('DA_API')).toBeInTheDocument());

    // Só então o arquivo responde — e deve ser ignorado.
    arquivo.resolve();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByText('DO_ARQUIVO')).not.toBeInTheDocument();
    expect(screen.getByText('DA_API')).toBeInTheDocument();
  });

  it('colapsa a digitação do ano numa única consulta ao backend', async () => {
    /**
     * Um `<input type="date">` emite um `change` por dígito do ano, porque a data
     * fica válida a cada passo. Os quatro valores abaixo são os que o Chrome
     * realmente emite ao digitar `2025` — medidos pelo protocolo de debug. Sem o
     * debounce, os três primeiros virariam execuções do analyzer em anos que
     * ninguém pediu.
     */
    const { calls } = mockFetch({
      '/report.json': { body: RELATORIO_COMPLETO },
      '/api/report': { body: RELATORIO_JANEIRO },
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Cliente_2')).toBeInTheDocument());

    const de = screen.getByLabelText('Período — de');
    for (const valor of ['0002-01-01', '0020-01-01', '0202-01-01', '2025-01-01']) {
      fireEvent.change(de, { target: { value: valor } });
    }

    // O relatório de janeiro não traz o Cliente_2: sua saída marca o fim da troca.
    await waitFor(() => expect(screen.queryByText('Cliente_2')).not.toBeInTheDocument());

    const consultas = calls.filter((u) => u.includes('/api/report'));
    expect(consultas).toHaveLength(1);
    expect(consultas[0]).toContain('start=2025-01-01');
  });

  it('mantém os campos de data editáveis enquanto o backend recalcula', async () => {
    /**
     * Desabilitar durante o reprocessamento engoliria os dígitos seguintes do
     * ano — era o defeito que o debounce substituiu.
     */
    const api = deferred();

    mockFetch({
      '/report.json': { body: RELATORIO_COMPLETO },
      '/api/report': async () => {
        await api.promise;
        return { body: RELATORIO_JANEIRO };
      },
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Cliente_2')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Período — de'), { target: { value: '2025-01-01' } });

    await waitFor(() => expect(screen.getByText(/reprocessando no analyzer/i)).toBeInTheDocument());
    expect(screen.getByLabelText('Período — de')).toBeEnabled();
    expect(screen.getByLabelText('até')).toBeEnabled();

    api.resolve();
    await waitFor(() =>
      expect(screen.queryByText(/reprocessando no analyzer/i)).not.toBeInTheDocument(),
    );
  });

  it('avisa quando o período não tem pedidos, em vez de parecer quebrado', async () => {
    mockFetch({
      '/report.json': { body: RELATORIO_COMPLETO },
      '/api/report': {
        body: report(
          [
            customer({ customer_id: 1, total_pedidos: 0, total_gasto_antes_desconto: 0, desconto_aplicado_percentual: 0, desconto_valor: 0, total_gasto_apos_desconto: 0 }),
            customer({ customer_id: 2, nome: 'Cliente_2', total_pedidos: 0, total_gasto_antes_desconto: 0, desconto_aplicado_percentual: 0, desconto_valor: 0, total_gasto_apos_desconto: 0 }),
          ],
          { data_inicial: '2025-06-01', data_final: '2025-06-30' },
        ),
      },
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Cliente_2')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Período — de'), '2025-06-01');

    await waitFor(() =>
      expect(screen.getByText(/nenhum pedido no período selecionado/i)).toBeInTheDocument(),
    );
    // A base inteira continua listada, zerada.
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
});

describe('DashboardPage — filtros locais', () => {
  beforeEach(() => {
    mockFetch({ '/report.json': { body: RELATORIO_COMPLETO } });
  });

  it('filtra a tabela por nome sem consultar o backend', async () => {
    const { calls } = mockFetch({ '/report.json': { body: RELATORIO_COMPLETO } });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Cliente_2')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/buscar cliente/i), 'Cliente_2');

    await waitFor(() => expect(screen.queryByText('Cliente_1')).not.toBeInTheDocument());
    expect(screen.getByText('Cliente_2')).toBeInTheDocument();
    expect(calls.some((u) => u.includes('/api/report'))).toBe(false);
  });

  it('casa por substring do nome ou por ID exato, não só pelo ID', async () => {
    /**
     * Digitar `2` alcança tanto o `Cliente_2` (nome e ID) quanto o `Cliente_12`
     * (só o nome). A busca é a união dos dois critérios — documentado porque o
     * roteiro de homologação já afirmou o contrário uma vez.
     */
    mockFetch({
      '/report.json': {
        body: report([
          customer({ customer_id: 2, nome: 'Cliente_2' }),
          customer({ customer_id: 12, nome: 'Cliente_12' }),
          customer({ customer_id: 3, nome: 'Cliente_3' }),
        ]),
      },
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Cliente_3')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/buscar cliente/i), '2');

    await waitFor(() => expect(screen.queryByText('Cliente_3')).not.toBeInTheDocument());
    expect(screen.getByText('Cliente_2')).toBeInTheDocument();
    expect(screen.getByText('Cliente_12')).toBeInTheDocument();
  });

  it('faz os cards refletirem o recorte local, e não a base inteira', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Cliente_2')).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/filtrar por categoria/i), 'VIP');

    await waitFor(() => expect(cardValue(/volume bruto/i)).toBe('R$ 1.000,00'));
    expect(screen.getByText(/de 2 na base/i)).toBeInTheDocument();
  });

  it('deixa só os clientes com suspeitas quando o toggle está ligado', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Cliente_2')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('checkbox', { name: /apenas anômalos/i }));

    await waitFor(() => expect(screen.queryByText('Cliente_2')).not.toBeInTheDocument());
    expect(screen.getByText('Cliente_1')).toBeInTheDocument();
  });
});

describe('DashboardPage — auditoria e exportação', () => {
  it('abre a gaveta de anomalias com os dados do cliente clicado', async () => {
    mockFetch({ '/report.json': { body: RELATORIO_COMPLETO } });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Cliente_1')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /abrir auditoria de Cliente_1/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Pedido #699')).toBeInTheDocument();
  });

  it('fecha a gaveta com Escape', async () => {
    mockFetch({ '/report.json': { body: RELATORIO_COMPLETO } });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Cliente_1')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /abrir auditoria de Cliente_1/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('desabilita a exportação enquanto não há dados', async () => {
    mockFetch({
      '/report.json': { status: 404, body: null },
      '/api/report': { status: 503, body: { error: 'indisponível' } },
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText(/relatório não carregado/i)).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /exportar relatório/i })).toBeDisabled();
  });

  it('habilita a exportação com dados carregados', async () => {
    mockFetch({ '/report.json': { body: RELATORIO_COMPLETO } });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Cliente_1')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /exportar relatório/i })).toBeEnabled();
  });
});
