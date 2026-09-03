import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomersTable } from '@/components/CustomersTable';
import { brl, customer, suspiciousOrder } from './factories';

describe('CustomersTable — estrutura', () => {
  it('mostra um estado vazio explicando que é efeito do filtro', () => {
    render(<CustomersTable data={[]} onSelectCustomer={vi.fn()} />);

    expect(screen.getByText(/nenhum registro encontrado com os filtros aplicados/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('row')).toHaveLength(2); // cabeçalho + linha do aviso
  });

  it('renderiza uma linha por cliente', () => {
    render(
      <CustomersTable
        data={[customer(), customer({ customer_id: 2, nome: 'Cliente_2' })]}
        onSelectCustomer={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('row')).toHaveLength(3); // cabeçalho + 2 clientes
  });

  it('descreve a tabela para leitores de tela', () => {
    render(<CustomersTable data={[customer()]} onSelectCustomer={vi.fn()} />);

    expect(screen.getByRole('table')).toHaveAccessibleName(/consolidado por cliente/i);
  });

  it('marca o nome do cliente como cabeçalho da linha', () => {
    render(<CustomersTable data={[customer()]} onSelectCustomer={vi.fn()} />);

    const rowHeader = screen.getByRole('rowheader', { name: 'Cliente_1' });
    expect(rowHeader).toBeInTheDocument();
  });
});

describe('CustomersTable — valores exibidos', () => {
  it('formata os valores monetários em pt-BR', () => {
    render(
      <CustomersTable
        data={[
          customer({
            total_gasto_antes_desconto: 10863.68,
            desconto_valor: 1086.37,
            total_gasto_apos_desconto: 9777.31,
          }),
        ]}
        onSelectCustomer={vi.fn()}
      />,
    );

    const linha = within(screen.getAllByRole('row')[1]!);
    expect(brl(linha.getByText(/10\.863,68/).textContent ?? '')).toContain('R$ 10.863,68');
    expect(brl(linha.getByText(/9\.777,31/).textContent ?? '')).toContain('R$ 9.777,31');
  });

  it('mostra o percentual e o valor absoluto do desconto', () => {
    render(
      <CustomersTable
        data={[customer({ desconto_aplicado_percentual: 10, desconto_valor: 1086.37 })]}
        onSelectCustomer={vi.fn()}
      />,
    );

    const linha = within(screen.getAllByRole('row')[1]!);
    expect(linha.getByText('10%')).toBeInTheDocument();
    expect(brl(linha.getByText(/1\.086,37/).textContent ?? '')).toContain('R$ 1.086,37');
  });

  it('usa um travessão em vez de "0%" quando não há desconto', () => {
    render(
      <CustomersTable
        data={[customer({ desconto_aplicado_percentual: 0, desconto_valor: 0 })]}
        onSelectCustomer={vi.fn()}
      />,
    );

    const linha = within(screen.getAllByRole('row')[1]!);
    expect(linha.getByText('—')).toBeInTheDocument();
    expect(linha.queryByText('0%')).not.toBeInTheDocument();
  });
});

describe('CustomersTable — coluna de auditoria', () => {
  it('não oferece botão para cliente sem suspeitas', () => {
    render(<CustomersTable data={[customer()]} onSelectCustomer={vi.fn()} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/sem anomalias/i)).toBeInTheDocument();
  });

  it('oferece botão com contagem e rótulo acessível quando há suspeitas', () => {
    render(
      <CustomersTable
        data={[
          customer({
            nome: 'Cliente_13',
            pedidos_suspeitos: [suspiciousOrder(), suspiciousOrder({ order_id: 700 })],
          }),
        ]}
        onSelectCustomer={vi.fn()}
      />,
    );

    const botao = screen.getByRole('button', {
      name: /abrir auditoria de Cliente_13: 2 pedido\(s\) suspeito\(s\)/i,
    });
    expect(botao).toHaveTextContent('2 suspeitos');
  });

  it('usa o singular com uma única suspeita', () => {
    render(
      <CustomersTable
        data={[customer({ pedidos_suspeitos: [suspiciousOrder()] })]}
        onSelectCustomer={vi.fn()}
      />,
    );

    expect(screen.getByRole('button')).toHaveTextContent('1 suspeito');
  });

  it('entrega o cliente inteiro ao abrir a auditoria', async () => {
    const onSelectCustomer = vi.fn();
    const alvo = customer({ customer_id: 13, pedidos_suspeitos: [suspiciousOrder()] });

    render(<CustomersTable data={[alvo]} onSelectCustomer={onSelectCustomer} />);
    await userEvent.click(screen.getByRole('button'));

    expect(onSelectCustomer).toHaveBeenCalledWith(alvo);
  });
});
