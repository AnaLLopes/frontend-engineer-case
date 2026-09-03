import React from 'react';
import { CustomerReport } from '@/types';
import { formatBRL } from '@/lib/format';

interface CustomersTableProps {
  data: CustomerReport[];
  onSelectCustomer: (customer: CustomerReport) => void;
}

export const CustomersTable: React.FC<CustomersTableProps> = ({ data, onSelectCustomer }) => (
  <div className="bg-cw-card border border-cw-border rounded-xl overflow-x-auto">
    <table className="w-full text-left text-sm">
      <caption className="sr-only">
        Consolidado por cliente: pedidos, gasto bruto, desconto aplicado, gasto líquido e
        pedidos suspeitos.
      </caption>
      <thead className="bg-cw-elevated border-b border-cw-border text-xs uppercase tracking-wider text-cw-muted font-semibold">
        <tr>
          <th scope="col" className="px-5 py-3">ID</th>
          <th scope="col" className="px-5 py-3">Cliente</th>
          <th scope="col" className="px-5 py-3">Categoria</th>
          <th scope="col" className="px-5 py-3 text-right">Pedidos</th>
          <th scope="col" className="px-5 py-3 text-right">Gasto bruto</th>
          <th scope="col" className="px-5 py-3 text-center">Desconto</th>
          <th scope="col" className="px-5 py-3 text-right">Gasto líquido</th>
          <th scope="col" className="px-5 py-3 text-center">Auditoria</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-cw-border">
        {data.length === 0 ? (
          <tr>
            <td colSpan={8} className="text-center py-10 text-cw-dim">
              Nenhum registro encontrado com os filtros aplicados.
            </td>
          </tr>
        ) : (
          data.map((customer) => {
            const suspiciousCount = customer.pedidos_suspeitos.length;

            return (
              <tr key={customer.customer_id} className="hover:bg-cw-white/[0.02] transition">
                <td className="px-5 py-4 font-mono text-cw-dim">#{customer.customer_id}</td>
                <th scope="row" className="px-5 py-4 font-semibold text-white text-left">
                  {customer.nome}
                </th>
                <td className="px-5 py-4">
                  <span
                    className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-md ${
                      customer.categoria === 'VIP'
                        ? 'bg-cw-gold-dim text-cw-gold'
                        : 'bg-cw-white/5 text-cw-muted'
                    }`}
                  >
                    {customer.categoria}
                  </span>
                </td>
                <td className="px-5 py-4 text-right font-mono">{customer.total_pedidos}</td>
                <td className="px-5 py-4 text-right font-mono">
                  {formatBRL(customer.total_gasto_antes_desconto)}
                </td>
                <td className="px-5 py-4 text-center font-mono">
                  {customer.desconto_aplicado_percentual > 0 ? (
                    <span className="text-cw-neon">
                      {customer.desconto_aplicado_percentual}%
                      <span className="block text-[10px] text-cw-dim">
                        −{formatBRL(customer.desconto_valor)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-cw-dim">—</span>
                  )}
                </td>
                <td className="px-5 py-4 text-right font-mono font-bold text-cw-neon">
                  {formatBRL(customer.total_gasto_apos_desconto)}
                </td>
                <td className="px-5 py-4 text-center">
                  {suspiciousCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => onSelectCustomer(customer)}
                      aria-label={`Abrir auditoria de ${customer.nome}: ${suspiciousCount} pedido(s) suspeito(s)`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-cw-danger-dim border border-cw-danger text-cw-danger text-xs font-semibold rounded-full hover:bg-cw-danger hover:text-white focus-visible:ring-2 focus-visible:ring-cw-neon transition"
                    >
                      <span aria-hidden="true">⚠</span>
                      {suspiciousCount} suspeito{suspiciousCount > 1 ? 's' : ''}
                    </button>
                  ) : (
                    <span className="text-xs text-cw-dim">Sem anomalias</span>
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </div>
);
