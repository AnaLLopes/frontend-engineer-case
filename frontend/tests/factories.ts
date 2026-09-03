import { CustomerReport, SuspiciousOrder } from '@/types';

/**
 * Fábricas de dados para os testes. Os valores padrão são coerentes entre si
 * (líquido = bruto − desconto), para nenhum teste passar com um dado impossível.
 */

/**
 * O `Intl.NumberFormat('pt-BR')` separa "R$" do número com espaço não separável
 * (U+00A0). Comparar com espaço comum falha de um jeito que parece idêntico na
 * mensagem de erro, então a normalização fica centralizada aqui, com o code
 * point escapado — escrever o caractere literal no arquivo é frágil.
 */
export const brl = (texto: string | null | undefined): string =>
  (texto ?? '').replace(/\u00A0/g, ' ');

/**
 * Promessa controlada pelo teste, para segurar uma resposta e liberar quando
 * quiser. Evita o padrão `let resolver: (() => void) | null`, que o TypeScript
 * estreita para `never` porque não vê a atribuição dentro do callback.
 */
export function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export function suspiciousOrder(overrides: Partial<SuspiciousOrder> = {}): SuspiciousOrder {
  return {
    order_id: 699,
    date: '2025-01-11',
    value: 1877.46,
    customer_mean: 543.18,
    ...overrides,
  };
}

export function customer(overrides: Partial<CustomerReport> = {}): CustomerReport {
  const base: CustomerReport = {
    customer_id: 1,
    nome: 'Cliente_1',
    categoria: 'VIP',
    total_pedidos: 20,
    total_gasto_antes_desconto: 1000,
    desconto_aplicado_percentual: 10,
    desconto_valor: 100,
    total_gasto_apos_desconto: 900,
    pedidos_suspeitos: [],
  };
  return { ...base, ...overrides };
}

/** Envelope no formato que `analyzer.py` produz. */
export function report(
  clientes: CustomerReport[] = [customer()],
  periodo: { data_inicial: string | null; data_final: string | null } | null = {
    data_inicial: null,
    data_final: null,
  },
) {
  return { periodo, clientes };
}
