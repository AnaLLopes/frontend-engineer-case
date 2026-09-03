import { describe, expect, it } from 'vitest';
import { formatBRL, formatDate, formatPeriod } from '@/lib/format';
import { brl } from './factories';

describe('formatPeriod', () => {
  it('formata os dois limites com travessão', () => {
    expect(formatPeriod({ data_inicial: '2025-01-01', data_final: '2025-01-31' })).toBe(
      '01/01/2025 – 31/01/2025',
    );
  });

  it('mostra uma única data quando os limites são iguais', () => {
    expect(formatPeriod({ data_inicial: '2025-01-13', data_final: '2025-01-13' })).toBe(
      '13/01/2025',
    );
  });

  it('descreve limite aberto à direita', () => {
    expect(formatPeriod({ data_inicial: '2025-02-01', data_final: null })).toBe(
      'a partir de 01/02/2025',
    );
  });

  it('descreve limite aberto à esquerda', () => {
    expect(formatPeriod({ data_inicial: null, data_final: '2025-01-05' })).toBe(
      'até 05/01/2025',
    );
  });

  it('devolve null quando a análise rodou sem filtro — a interface omite o indicador', () => {
    expect(formatPeriod({ data_inicial: null, data_final: null })).toBeNull();
  });

  it('devolve null quando o arquivo não informa o período', () => {
    expect(formatPeriod(null)).toBeNull();
  });
});

describe('formatação de valores', () => {
  it('formata moeda em pt-BR', () => {
    expect(brl(formatBRL(1877.46))).toBe('R$ 1.877,46');
    expect(brl(formatBRL(0))).toBe('R$ 0,00');
  });

  it('arredonda para dois dígitos na exibição', () => {
    expect(brl(formatBRL(1000.005))).toBe('R$ 1.000,01');
  });

  it('converte a data ISO para o formato brasileiro', () => {
    expect(formatDate('2025-01-11')).toBe('11/01/2025');
  });

  it('devolve a entrada quando não é uma data ISO reconhecível', () => {
    expect(formatDate('sem-data')).toBe('sem-data');
  });
});
