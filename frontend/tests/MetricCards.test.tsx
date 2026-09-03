import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricCards } from '@/components/MetricCards';
import { brl, customer, suspiciousOrder } from './factories';

const cardValue = (rotulo: RegExp) =>
  brl(screen.getByText(rotulo).parentElement?.querySelector('p')?.textContent);

describe('MetricCards — agregação', () => {
  it('soma bruto, líquido e descontos das linhas recebidas', () => {
    render(
      <MetricCards
        data={[
          customer({ total_gasto_antes_desconto: 1000, desconto_valor: 100, total_gasto_apos_desconto: 900 }),
          customer({ customer_id: 2, total_gasto_antes_desconto: 500, desconto_valor: 25, total_gasto_apos_desconto: 475 }),
        ]}
        totalCustomers={2}
        isFiltered={false}
      />,
    );

    expect(cardValue(/volume bruto/i)).toBe('R$ 1.500,00');
    expect(cardValue(/volume líquido/i)).toBe('R$ 1.375,00');
    expect(brl(screen.getByText(/descontos concedidos/i).textContent)).toContain('R$ 125,00');
  });

  it('soma o campo desconto_valor em vez de subtrair bruto − líquido', () => {
    /**
     * O backend arredonda cada desconto em centavos com ROUND_HALF_UP e deriva o
     * líquido por subtração. Recalcular a diferença em float aqui reintroduziria
     * a divergência de 1 centavo que o backend eliminou — este teste usa um
     * caso onde os dois caminhos dariam resultados diferentes.
     */
    render(
      <MetricCards
        data={[
          customer({
            total_gasto_antes_desconto: 15265.9,
            desconto_valor: 763.3,
            total_gasto_apos_desconto: 14502.6,
          }),
        ]}
        totalCustomers={1}
        isFiltered={false}
      />,
    );

    expect(brl(screen.getByText(/descontos concedidos/i).textContent)).toContain('R$ 763,30');
  });

  it('conta os pedidos suspeitos, não os clientes com suspeitas', () => {
    render(
      <MetricCards
        data={[
          customer({ pedidos_suspeitos: [suspiciousOrder(), suspiciousOrder({ order_id: 700 })] }),
          customer({ customer_id: 2, pedidos_suspeitos: [suspiciousOrder({ order_id: 800 })] }),
          customer({ customer_id: 3, pedidos_suspeitos: [] }),
        ]}
        totalCustomers={3}
        isFiltered={false}
      />,
    );

    expect(cardValue(/transações suspeitas/i)).toBe('3');
  });

  it('zera todos os totais sem dados, em vez de quebrar', () => {
    render(<MetricCards data={[]} totalCustomers={0} isFiltered={false} />);

    expect(cardValue(/clientes/i)).toBe('0');
    expect(cardValue(/volume bruto/i)).toBe('R$ 0,00');
    expect(cardValue(/transações suspeitas/i)).toBe('0');
  });
});

describe('MetricCards — contexto do recorte', () => {
  it('mostra o total da base quando os filtros locais estão ativos', () => {
    render(<MetricCards data={[customer()]} totalCustomers={50} isFiltered />);

    expect(cardValue(/clientes/i)).toBe('1');
    expect(screen.getByText(/de 50 na base/i)).toBeInTheDocument();
  });

  it('não menciona a base quando nada está filtrado', () => {
    render(<MetricCards data={[customer()]} totalCustomers={1} isFiltered={false} />);

    expect(screen.queryByText(/na base/i)).not.toBeInTheDocument();
    expect(screen.getByText(/base completa processada/i)).toBeInTheDocument();
  });

  it('expõe a seção com rótulo acessível', () => {
    render(<MetricCards data={[customer()]} totalCustomers={1} isFiltered={false} />);

    expect(screen.getByRole('region', { name: /indicadores consolidados/i })).toBeInTheDocument();
  });
});
