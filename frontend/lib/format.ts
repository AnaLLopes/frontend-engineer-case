import { ReportPeriod } from '@/types';

/**
 * Formatação de apresentação em `pt-BR`. Fica separada de `lib/report.ts`
 * (que valida o contrato do JSON) porque são responsabilidades distintas:
 * uma decide se o dado é válido, a outra decide como ele aparece na tela.
 */

export const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export const formatDate = (isoDate: string): string => {
  const [year, month, day] = isoDate.split('-');
  return year && month && day ? `${day}/${month}/${year}` : isoDate;
};

/** Rótulo do recorte analisado, ou `null` quando não há período a declarar. */
export function formatPeriod(periodo: ReportPeriod | null): string | null {
  if (!periodo) return null;

  const { data_inicial: inicio, data_final: fim } = periodo;
  if (inicio && fim) {
    return inicio === fim ? formatDate(inicio) : `${formatDate(inicio)} – ${formatDate(fim)}`;
  }
  if (inicio) return `a partir de ${formatDate(inicio)}`;
  if (fim) return `até ${formatDate(fim)}`;
  return null;
}
