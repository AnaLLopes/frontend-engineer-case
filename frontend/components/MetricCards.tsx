import React from 'react';
import { CustomerReport } from '@/types';
import { formatBRL } from '@/lib/format';

interface MetricCardsProps {
  data: CustomerReport[];
  totalCustomers: number;
  isFiltered: boolean;
}

interface MetricCardProps {
  label: string;
  value: string;
  hint: string;
  valueClassName?: string;
  hintClassName?: string;
  cardClassName?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  hint,
  valueClassName = 'text-white',
  hintClassName = 'text-cw-dim',
  cardClassName = 'border-cw-border',
}) => (
  <div className={`bg-cw-card border p-5 rounded-xl ${cardClassName}`}>
    <span className="text-xs font-semibold text-cw-muted uppercase tracking-wider">{label}</span>
    <p className={`text-3xl font-mono font-bold mt-2 ${valueClassName}`}>{value}</p>
    <span className={`text-xs mt-1 block ${hintClassName}`}>{hint}</span>
  </div>
);

export const MetricCards: React.FC<MetricCardsProps> = ({ data, totalCustomers, isFiltered }) => {
  const totals = data.reduce(
    (acc, customer) => ({
      raw: acc.raw + customer.total_gasto_antes_desconto,
      net: acc.net + customer.total_gasto_apos_desconto,
      // Soma o campo `desconto_valor` do backend em vez de subtrair bruto - líquido:
      // o Python já arredondou cada desconto em centavos com ROUND_HALF_UP.
      discount: acc.discount + customer.desconto_valor,
      anomalies: acc.anomalies + customer.pedidos_suspeitos.length,
    }),
    { raw: 0, net: 0, discount: 0, anomalies: 0 },
  );

  return (
    <section
      aria-label="Indicadores consolidados"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
    >
      <MetricCard
        label="Clientes"
        value={String(data.length)}
        hint={isFiltered ? `de ${totalCustomers} na base` : 'Base completa processada'}
      />
      <MetricCard
        label="Volume bruto"
        value={formatBRL(totals.raw)}
        valueClassName="text-cw-neon"
        hint="Soma dos pedidos no período"
      />
      <MetricCard
        label="Volume líquido"
        value={formatBRL(totals.net)}
        hint={`Descontos concedidos: ${formatBRL(totals.discount)}`}
        hintClassName="text-cw-neon"
      />
      <MetricCard
        label="Transações suspeitas"
        value={String(totals.anomalies)}
        valueClassName="text-cw-danger"
        cardClassName="border-cw-danger/40"
        hint="Acima de 3x a média do cliente"
      />
    </section>
  );
};
