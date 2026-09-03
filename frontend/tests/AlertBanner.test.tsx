import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertBanner } from '@/components/AlertBanner';

describe('AlertBanner', () => {
  it('anuncia-se como alerta, para o leitor de tela interromper', () => {
    render(
      <AlertBanner
        title="Importação recusada"
        message="customers.json não é a saída do analyzer."
        dismissLabel="Dispensar aviso de importação"
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Importação recusada')).toBeInTheDocument();
    expect(screen.getByText(/não é a saída do analyzer/)).toBeInTheDocument();
  });

  it('renderiza o contexto adicional quando fornecido', () => {
    render(
      <AlertBanner
        title="Importação recusada"
        message="arquivo inválido"
        dismissLabel="Dispensar"
        onDismiss={vi.fn()}
      >
        Os dados abaixo continuam sendo os do relatório carregado antes.
      </AlertBanner>,
    );

    expect(screen.getByText(/continuam sendo os do relatório/)).toBeInTheDocument();
  });

  it('omite o parágrafo secundário sem contexto adicional', () => {
    const { container } = render(
      <AlertBanner title="Erro" message="detalhe" dismissLabel="Dispensar" onDismiss={vi.fn()} />,
    );

    expect(container.querySelectorAll('p')).toHaveLength(2); // título + mensagem
  });

  it('usa o rótulo recebido no botão de fechar, e não o "times" do &times;', async () => {
    const onDismiss = vi.fn();
    render(
      <AlertBanner
        title="Falha ao exportar o PDF"
        message="erro"
        dismissLabel="Dispensar aviso de exportação"
        onDismiss={onDismiss}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Dispensar aviso de exportação' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
