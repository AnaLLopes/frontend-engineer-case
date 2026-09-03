export type Tier = 'VIP' | 'Regular';

export interface SuspiciousOrder {
  order_id: number;
  /** Data do pedido no formato YYYY-MM-DD. */
  date: string;
  value: number;
  /** Média dos pedidos do cliente usada como base do limiar de 3x. */
  customer_mean: number;
}

export interface CustomerReport {
  customer_id: number;
  nome: string;
  categoria: Tier;
  total_pedidos: number;
  total_gasto_antes_desconto: number;
  desconto_aplicado_percentual: number;
  /** Valor absoluto do desconto em reais, já arredondado em centavos. */
  desconto_valor: number;
  total_gasto_apos_desconto: number;
  pedidos_suspeitos: SuspiciousOrder[];
}

export interface ReportPeriod {
  data_inicial: string | null;
  data_final: string | null;
}


export interface AnalysisReport {
  periodo: ReportPeriod | null;
  clientes: CustomerReport[];
}

export type TierFilter = Tier | 'ALL';
