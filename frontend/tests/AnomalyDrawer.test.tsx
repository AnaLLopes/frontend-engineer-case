import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnomalyDrawer } from '@/components/AnomalyDrawer';
import { brl, customer, suspiciousOrder } from './factories';

const comSuspeitos = customer({
  nome: 'Cliente_13',
  categoria: 'VIP',
  total_pedidos: 20,
  pedidos_suspeitos: [
    suspiciousOrder({ order_id: 271, date: '2025-01-08', value: 2196.65, customer_mean: 688.3 }),
  ],
});


describe('AnomalyDrawer — visibilidade', () => {
  it('não renderiza nada sem cliente selecionado', () => {
    render(<AnomalyDrawer customer={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renderiza como diálogo modal rotulado pelo nome do cliente', () => {
    render(<AnomalyDrawer customer={comSuspeitos} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Cliente_13' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});

describe('AnomalyDrawer — conteúdo da auditoria', () => {
  it('mostra o pedido, o valor, a média e o limiar de 3x', () => {
    render(<AnomalyDrawer customer={comSuspeitos} onClose={vi.fn()} />);

    // Escopado ao item da lista: o valor também aparece no resumo do topo.
    const item = within(screen.getByRole('listitem'));

    expect(item.getByText('Pedido #271')).toBeInTheDocument();
    expect(brl(item.getByText(/2\.196,65/).textContent ?? '')).toContain('R$ 2.196,65');
    expect(brl(item.getByText(/688,30/).textContent ?? '')).toContain('R$ 688,30');
    // 3 × 688,30 = 2.064,90, e o pedido de 2.196,65 supera esse limiar.
    expect(brl(item.getByText(/2\.064,90/).textContent ?? '')).toContain('R$ 2.064,90');
  });

  it('mostra a data no formato brasileiro, com datetime legível por máquina', () => {
    render(<AnomalyDrawer customer={comSuspeitos} onClose={vi.fn()} />);

    const time = screen.getByText('08/01/2025');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2025-01-08');
  });

  it('lista todos os pedidos suspeitos e soma o total exposto', () => {
    const varios = customer({
      pedidos_suspeitos: [
        suspiciousOrder({ order_id: 1, value: 1000, customer_mean: 100 }),
        suspiciousOrder({ order_id: 2, value: 500, customer_mean: 100 }),
      ],
    });
    render(<AnomalyDrawer customer={varios} onClose={vi.fn()} />);

    const itens = screen.getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    expect(within(itens[0]!).getByText('Pedido #1')).toBeInTheDocument();
    expect(within(itens[1]!).getByText('Pedido #2')).toBeInTheDocument();

    // O resumo do topo soma os dois valores: 1000 + 500.
    const resumo = screen.getByText(/pedido\(s\) com valor acima de/);
    expect(brl(resumo.textContent ?? '')).toContain('R$ 1.500,00');
    expect(resumo.textContent).toContain('2 pedido(s)');
  });

  it('identifica o cliente pelo id, categoria e quantidade de pedidos', () => {
    render(<AnomalyDrawer customer={comSuspeitos} onClose={vi.fn()} />);

    expect(screen.getByText(/ID #1 • VIP • 20 pedido\(s\)/)).toBeInTheDocument();
  });
});

describe('AnomalyDrawer — acessibilidade e fechamento', () => {
  it('fecha com a tecla Escape', async () => {
    const onClose = vi.fn();
    render(<AnomalyDrawer customer={comSuspeitos} onClose={onClose} />);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fecha pelo botão × do cabeçalho, que tem rótulo acessível', async () => {
    const onClose = vi.fn();
    render(<AnomalyDrawer customer={comSuspeitos} onClose={onClose} />);

    // Sem aria-label, o leitor de tela anunciaria apenas "times" (o &times;).
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fecha pelo botão do rodapé', async () => {
    const onClose = vi.fn();
    render(<AnomalyDrawer customer={comSuspeitos} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Fechar auditoria' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('os dois botões de fechar têm nomes acessíveis distintos', () => {
    render(<AnomalyDrawer customer={comSuspeitos} onClose={vi.fn()} />);

    const nomes = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('move o foco para dentro da gaveta ao abrir', () => {
    render(<AnomalyDrawer customer={comSuspeitos} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
  });

  it('devolve o foco ao elemento que abriu a gaveta', () => {
    const gatilho = document.createElement('button');
    document.body.appendChild(gatilho);
    gatilho.focus();

    const { unmount } = render(<AnomalyDrawer customer={comSuspeitos} onClose={vi.fn()} />);
    expect(gatilho).not.toHaveFocus();

    unmount();
    expect(gatilho).toHaveFocus();

    gatilho.remove();
  });

  it('mantém o Tab dentro da gaveta, do último foco de volta para o primeiro', async () => {
    const fora = document.createElement('button');
    fora.textContent = 'controle atrás do overlay';
    document.body.appendChild(fora);

    render(<AnomalyDrawer customer={comSuspeitos} onClose={vi.fn()} />);

    const fechar = screen.getByRole('button', { name: 'Fechar' });
    const fecharAuditoria = screen.getByRole('button', { name: 'Fechar auditoria' });
    expect(fechar).toHaveFocus();

    await userEvent.tab();
    expect(fecharAuditoria).toHaveFocus();

    // Do último elemento, o Tab volta ao primeiro em vez de sair para o fundo.
    await userEvent.tab();
    expect(fechar).toHaveFocus();
    expect(fora).not.toHaveFocus();

    fora.remove();
  });

  it('com Shift+Tab no primeiro elemento, vai para o último', async () => {
    render(<AnomalyDrawer customer={comSuspeitos} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();

    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Fechar auditoria' })).toHaveFocus();
  });

  it('trava o scroll do body enquanto está aberta e restaura ao fechar', () => {
    document.body.style.overflow = 'auto';

    const { unmount } = render(<AnomalyDrawer customer={comSuspeitos} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('esconde o fundo escurecido dos leitores de tela', () => {
    const { container } = render(<AnomalyDrawer customer={comSuspeitos} onClose={vi.fn()} />);

    const overlay = container.querySelector('[aria-hidden="true"].fixed.inset-0');
    expect(overlay).toBeInTheDocument();
  });
});
