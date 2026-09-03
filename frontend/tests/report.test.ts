import { describe, expect, it } from 'vitest';
import { parseReport, ReportFormatError } from '@/lib/report';
import { customer, report, suspiciousOrder } from './factories';

describe('parseReport — formatos aceitos', () => {
  it('aceita o envelope { periodo, clientes } que o analyzer produz', () => {
    const parsed = parseReport(report([customer()], { data_inicial: '2025-01-01', data_final: '2025-01-31' }));

    expect(parsed.periodo).toEqual({ data_inicial: '2025-01-01', data_final: '2025-01-31' });
    expect(parsed.clientes).toHaveLength(1);
    expect(parsed.clientes[0]?.nome).toBe('Cliente_1');
  });

  it('aceita envelope com limites nulos (análise sem filtro)', () => {
    expect(parseReport(report()).periodo).toEqual({ data_inicial: null, data_final: null });
  });

  it('aceita limite aberto em um só lado', () => {
    const parsed = parseReport(report([customer()], { data_inicial: '2025-02-01', data_final: null }));
    expect(parsed.periodo).toEqual({ data_inicial: '2025-02-01', data_final: null });
  });

  it('aceita a lista pura de clientes, sem envelope, e marca o período como desconhecido', () => {
    const parsed = parseReport([customer()]);

    // `null` é diferente de `{ null, null }`: aqui o arquivo não informa o
    // recorte, o que não é a mesma coisa que "rodou sem filtro".
    expect(parsed.periodo).toBeNull();
    expect(parsed.clientes).toHaveLength(1);
  });

  it('preserva os pedidos suspeitos', () => {
    const parsed = parseReport(report([customer({ pedidos_suspeitos: [suspiciousOrder()] })]));

    expect(parsed.clientes[0]?.pedidos_suspeitos).toEqual([
      { order_id: 699, date: '2025-01-11', value: 1877.46, customer_mean: 543.18 },
    ]);
  });
});

describe('parseReport — reconhece os arquivos de entrada do desafio', () => {
  it('recusa o customers.json explicando qual arquivo é', () => {
    const customersJson = [{ id: 1, name: 'Cliente_1', tier: 'VIP' }];

    expect(() => parseReport(customersJson)).toThrow(ReportFormatError);
    expect(() => parseReport(customersJson)).toThrow(/customers\.json/);
  });

  it('recusa o orders.csv convertido em JSON', () => {
    const orders = [{ id: 1, customer_id: 3, value: 10, date: '2025-01-01' }];

    expect(() => parseReport(orders)).toThrow(/orders\.csv/);
  });
});

describe('parseReport — rejeições de contrato', () => {
  it('recusa um objeto que não é envelope nem lista', () => {
    expect(() => parseReport({ foo: 1 })).toThrow(/envelope|lista/);
  });

  it('recusa "clientes" que não é lista', () => {
    expect(() => parseReport({ periodo: null, clientes: {} })).toThrow(/"clientes"/);
  });

  it('recusa "periodo" que não é objeto', () => {
    expect(() => parseReport({ periodo: 'janeiro', clientes: [] })).toThrow(/"periodo"/);
  });

  it.each(['01/01/2025', '2025-1-1', 'ontem'])(
    'recusa periodo.data_inicial fora do formato ISO: %s',
    (bad) => {
      expect(() =>
        parseReport({ periodo: { data_inicial: bad, data_final: null }, clientes: [] }),
      ).toThrow(/YYYY-MM-DD/);
    },
  );

  it('recusa categoria fora da união VIP | Regular', () => {
    const invalido = report([customer({ categoria: 'Premium' as never })]);

    expect(() => parseReport(invalido)).toThrow(/fora do contrato/);
    expect(() => parseReport(invalido)).toThrow(/Premium/);
  });

  it('recusa relatório sem desconto_valor — o campo que o backend passou a emitir', () => {
    const semCampo = report([customer()]);
    delete (semCampo.clientes[0] as unknown as Record<string, unknown>).desconto_valor;

    expect(() => parseReport(semCampo)).toThrow(/desconto_valor/);
  });

  it.each([
    'customer_id',
    'nome',
    'total_pedidos',
    'total_gasto_antes_desconto',
    'desconto_aplicado_percentual',
    'total_gasto_apos_desconto',
  ])('recusa relatório sem o campo obrigatório %s', (campo) => {
    const semCampo = report([customer()]);
    delete (semCampo.clientes[0] as unknown as Record<string, unknown>)[campo];

    expect(() => parseReport(semCampo)).toThrow(new RegExp(campo));
  });

  it('recusa valores numéricos não finitos', () => {
    const invalido = report([customer({ total_gasto_antes_desconto: NaN })]);
    expect(() => parseReport(invalido)).toThrow(/numérico/);
  });

  it('recusa pedido suspeito malformado', () => {
    const invalido = report([
      customer({ pedidos_suspeitos: [{ order_id: 1 } as never] }),
    ]);
    expect(() => parseReport(invalido)).toThrow(/date|numérico|texto/);
  });

  it('identifica o registro problemático pela posição', () => {
    const invalido = report([customer(), customer({ customer_id: 'dois' as never })]);
    expect(() => parseReport(invalido)).toThrow(/registro 2/);
  });
});
