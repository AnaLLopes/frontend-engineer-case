import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FiltersBar } from '@/components/FiltersBar';
import { TierFilter } from '@/types';

interface Overrides {
  search?: string;
  tier?: TierFilter;
  onlyAnomalies?: boolean;
  startDate?: string;
  endDate?: string;
  reprocessing?: boolean;
}

function setup(overrides: Overrides = {}) {
  const handlers = {
    onSearchChange: vi.fn(),
    onTierChange: vi.fn(),
    onOnlyAnomaliesChange: vi.fn(),
    onPeriodChange: vi.fn(),
  };

  render(
    <FiltersBar
      search={overrides.search ?? ''}
      tier={overrides.tier ?? 'ALL'}
      onlyAnomalies={overrides.onlyAnomalies ?? false}
      startDate={overrides.startDate ?? ''}
      endDate={overrides.endDate ?? ''}
      reprocessing={overrides.reprocessing ?? false}
      {...handlers}
    />,
  );

  return { ...handlers, user: userEvent.setup() };
}

const dateInputs = () => ({
  de: screen.getByLabelText('Período — de') as HTMLInputElement,
  ate: screen.getByLabelText('até') as HTMLInputElement,
});

describe('FiltersBar — filtro de período', () => {
  it('expõe os dois campos de data como inputs de data acessíveis por rótulo', () => {
    setup();
    const { de, ate } = dateInputs();

    expect(de).toHaveAttribute('type', 'date');
    expect(ate).toHaveAttribute('type', 'date');
  });

  it('reflete o período recebido por prop', () => {
    setup({ startDate: '2025-01-01', endDate: '2025-01-31' });
    const { de, ate } = dateInputs();

    expect(de.value).toBe('2025-01-01');
    expect(ate.value).toBe('2025-01-31');
  });

  it('avisa a mudança preservando o outro limite', async () => {
    const { onPeriodChange } = setup({ endDate: '2025-01-31' });

    await userEvent.type(dateInputs().de, '2025-01-01');

    expect(onPeriodChange).toHaveBeenLastCalledWith('2025-01-01', '2025-01-31');
  });

  it('avisa a mudança da data final preservando a inicial', async () => {
    const { onPeriodChange } = setup({ startDate: '2025-01-01' });

    await userEvent.type(dateInputs().ate, '2025-01-15');

    expect(onPeriodChange).toHaveBeenLastCalledWith('2025-01-01', '2025-01-15');
  });

  it('impede intervalo invertido pelos limites min/max dos próprios inputs', () => {
    setup({ startDate: '2025-01-10', endDate: '2025-01-20' });
    const { de, ate } = dateInputs();

    // O campo inicial não passa da data final, e vice-versa: o intervalo
    // invertido é barrado antes de chegar ao backend.
    expect(de).toHaveAttribute('max', '2025-01-20');
    expect(ate).toHaveAttribute('min', '2025-01-10');
  });

  it('não impõe min/max quando o outro limite está aberto', () => {
    setup();
    const { de, ate } = dateInputs();

    expect(de).not.toHaveAttribute('max');
    expect(ate).not.toHaveAttribute('min');
  });
});

describe('FiltersBar — botão de limpar período', () => {
  it('fica oculto quando não há período', () => {
    setup();
    expect(screen.queryByRole('button', { name: /limpar período/i })).not.toBeInTheDocument();
  });

  it.each([
    ['apenas data inicial', { startDate: '2025-01-01' }],
    ['apenas data final', { endDate: '2025-01-31' }],
    ['os dois limites', { startDate: '2025-01-01', endDate: '2025-01-31' }],
  ])('aparece com %s', (_caso, props) => {
    setup(props);
    expect(screen.getByRole('button', { name: /limpar período/i })).toBeInTheDocument();
  });

  it('limpa os dois limites de uma vez', async () => {
    const { onPeriodChange, user } = setup({ startDate: '2025-01-01', endDate: '2025-01-31' });

    await user.click(screen.getByRole('button', { name: /limpar período/i }));

    expect(onPeriodChange).toHaveBeenCalledWith('', '');
  });
});

describe('FiltersBar — estado de reprocessamento', () => {
  it('mantém os campos de data editáveis durante o reprocessamento', () => {
    /**
     * Bloquear os campos parece proteção, mas engole a digitação: um
     * `<input type="date">` emite um `change` a cada dígito do ano, e o
     * primeiro deles (`0002-…`) desabilitaria o campo antes do resto ser
     * digitado. Quem protege o backend é o debounce; quem protege contra
     * resposta fora de ordem é o contador de requisição no `useReport`.
     */
    setup({ startDate: '2025-01-01', reprocessing: true });
    const { de, ate } = dateInputs();

    expect(de).toBeEnabled();
    expect(ate).toBeEnabled();
  });

  it('bloqueia apenas o botão de limpar, que não é campo de digitação', () => {
    setup({ startDate: '2025-01-01', reprocessing: true });
    expect(screen.getByRole('button', { name: /limpar período/i })).toBeDisabled();
  });

  it('sinaliza o reprocessamento em texto, e não só desabilitando', () => {
    setup({ reprocessing: true });
    expect(screen.getByText(/reprocessando no analyzer/i)).toBeInTheDocument();
  });

  it('explica o efeito do filtro quando está em repouso', () => {
    setup();
    expect(screen.getByText(/recalculados pelo backend/i)).toBeInTheDocument();
    expect(screen.queryByText(/reprocessando/i)).not.toBeInTheDocument();
  });

  it('não desabilita os filtros locais, que não dependem do backend', () => {
    setup({ reprocessing: true });

    expect(screen.getByLabelText(/buscar cliente/i)).toBeEnabled();
    expect(screen.getByLabelText(/filtrar por categoria/i)).toBeEnabled();
  });
});

describe('FiltersBar — filtros locais', () => {
  it('propaga a busca por texto', async () => {
    const { onSearchChange, user } = setup();

    // O input é controlado e o teste não re-renderiza com o novo valor, então
    // digitar tecla a tecla dispararia um caractere por vez. `paste` envia o
    // texto inteiro num único evento, que é o contrato que importa aqui.
    await user.click(screen.getByLabelText(/buscar cliente/i));
    await user.paste('Cliente_7');

    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('Cliente_7');
  });

  it('dispara a cada tecla, sem debounce — a base tem 50 linhas', async () => {
    const { onSearchChange, user } = setup();

    await user.type(screen.getByLabelText(/buscar cliente/i), 'abc');

    expect(onSearchChange).toHaveBeenCalledTimes(3);
  });

  it('oferece as três opções de categoria e propaga a escolha', async () => {
    const { onTierChange, user } = setup();
    const select = screen.getByLabelText(/filtrar por categoria/i);

    expect(screen.getByRole('option', { name: 'Todas as categorias' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Apenas VIP' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Apenas Regular' })).toBeInTheDocument();

    await user.selectOptions(select, 'VIP');
    expect(onTierChange).toHaveBeenCalledWith('VIP');
  });

  it('propaga o toggle de anomalias', async () => {
    const { onOnlyAnomaliesChange, user } = setup();

    await user.click(screen.getByRole('checkbox', { name: /apenas anômalos/i }));

    expect(onOnlyAnomaliesChange).toHaveBeenCalledWith(true);
  });

  it('reflete o toggle ligado recebido por prop', () => {
    setup({ onlyAnomalies: true });
    expect(screen.getByRole('checkbox', { name: /apenas anômalos/i })).toBeChecked();
  });
});
