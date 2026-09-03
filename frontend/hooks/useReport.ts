'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnalysisReport, CustomerReport, ReportPeriod } from '@/types';
import { parseReport, ReportFormatError } from '@/lib/report';

/**
 * Dono de tudo que traz dados para a tela: a carga inicial, o reprocessamento
 * por período e a importação de um `report.json` de fora.
 *
 * As três vias convergem no mesmo estado porque respondem à mesma pergunta —
 * qual relatório está na tela e de onde ele veio. Manter isso num hook deixa a
 * página livre para tratar só de layout e dos filtros locais.
 */

/** De onde vieram os dados exibidos, e se há dados para exibir. */
export type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; source: string }
  | { status: 'empty' }
  | { status: 'error'; message: string; showGenerateHint: boolean };

/** Janela de espera antes de mandar o período ao backend. Ver `changePeriod`. */
export const PERIOD_DEBOUNCE_MS = 400;

async function readApiError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    /* resposta sem JSON: cai no genérico abaixo */
  }
  return `A API respondeu HTTP ${response.status}.`;
}

interface UseReportOptions {
  /** Chamado quando o conjunto de dados é trocado, para a tela descartar seleções. */
  onDatasetReplaced?: () => void;
}

export function useReport({ onDatasetReplaced }: UseReportOptions = {}) {
  const [data, setData] = useState<CustomerReport[]>([]);
  const [periodo, setPeriodo] = useState<ReportPeriod | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reprocessing, setReprocessing] = useState(false);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Descarta o resultado de uma consulta já superada por outra mais nova, para
  // trocas rápidas de período não deixarem um resultado antigo vencer na tela.
  const requestId = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Em ref para não entrar nas dependências dos callbacks abaixo.
  const notifyReplaced = useRef(onDatasetReplaced);
  notifyReplaced.current = onDatasetReplaced;

  const applyReport = useCallback((report: AnalysisReport, source: string) => {
    setData(report.clientes);
    setPeriodo(report.periodo);
    setLoad(report.clientes.length ? { status: 'ready', source } : { status: 'empty' });
  }, []);

  const loadInitial = useCallback(async () => {
    const current = ++requestId.current;
    setLoad({ status: 'loading' });

    /** A carga inicial também alinha os campos de data ao período do arquivo. */
    const apply = (report: AnalysisReport, source: string) => {
      setStartDate(report.periodo?.data_inicial ?? '');
      setEndDate(report.periodo?.data_final ?? '');
      applyReport(report, source);
    };

    try {
      const response = await fetch('/report.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const report = parseReport(await response.json());
      if (requestId.current !== current) return;
      apply(report, 'report.json');
      return;
    } catch (fileError: unknown) {
      const fileMessage =
        fileError instanceof Error ? fileError.message : 'falha ao ler o report.json';

      try {
        const response = await fetch('/api/report', { cache: 'no-store' });
        if (!response.ok) throw new ReportFormatError(await readApiError(response));
        const report = parseReport(await response.json());
        if (requestId.current !== current) return;
        apply(report, 'analyzer.py');
        return;
      } catch (apiError: unknown) {
        if (requestId.current !== current) return;
        const apiMessage =
          apiError instanceof Error ? apiError.message : 'a API também falhou';
        setLoad({
          status: 'error',
          message: `report.json não está disponível (${fileMessage}) e o reprocessamento pela API falhou: ${apiMessage}`,
          showGenerateHint: true,
        });
      }
    }
  }, [applyReport]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  /**
   * Reprocessa o período no backend. O recorte de datas muda **quais** pedidos
   * entram na análise, e disso dependem os descontos e a média das anomalias —
   * refazer essa conta no navegador duplicaria as regras de negócio.
   */
  const runPeriod = useCallback(
    async (start: string, end: string) => {
      const current = ++requestId.current;
      setPeriodError(null);

      const query = new URLSearchParams();
      if (start) query.set('start', start);
      if (end) query.set('end', end);
      const suffix = query.toString() ? `?${query}` : '';

      try {
        const response = await fetch(`/api/report${suffix}`, { cache: 'no-store' });
        if (!response.ok) throw new ReportFormatError(await readApiError(response));

        const report = parseReport(await response.json());
        if (requestId.current !== current) return;

        notifyReplaced.current?.();
        applyReport(report, 'analyzer.py');
      } catch (error: unknown) {
        if (requestId.current !== current) return;
        setPeriodError(
          error instanceof Error ? error.message : 'Erro desconhecido ao reprocessar o período.',
        );
      } finally {
        if (requestId.current === current) setReprocessing(false);
      }
    },
    [applyReport],
  );

  /**
   * Recebe cada alteração dos campos de data, mas só consulta o backend quando a
   * digitação assenta.
   *
   * Um `<input type="date">` emite um `change` a cada dígito do ano, porque a data
   * fica válida a cada passo: digitar `2025` produz `0002`, `0020`, `0202` e só
   * então `2025`. Sem o debounce, os três primeiros viram execuções do analyzer
   * com anos que ninguém pediu.
   *
   * O `reprocessing` sobe **na hora**, antes do debounce: os números na tela já
   * pertencem a outro recorte, e escurecê-los imediatamente é o sinal honesto.
   */
  const changePeriod = useCallback(
    (start: string, end: string) => {
      setStartDate(start);
      setEndDate(end);
      setReprocessing(true);

      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void runPeriod(start, end), PERIOD_DEBOUNCE_MS);
    },
    [runPeriod],
  );

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  /** Importa um relatório gerado noutra máquina ou período, validando o contrato. */
  const importFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const report = parseReport(JSON.parse(String(reader.result)));
          requestId.current += 1;
          setStartDate(report.periodo?.data_inicial ?? '');
          setEndDate(report.periodo?.data_final ?? '');
          setImportError(null);
          setPeriodError(null);
          notifyReplaced.current?.();
          applyReport(report, file.name);
        } catch (error: unknown) {
          setImportError(
            error instanceof Error
              ? `${file.name}: ${error.message}`
              : `${file.name}: não é um JSON válido.`,
          );
        }
      };
      reader.onerror = () => setImportError(`Não foi possível ler ${file.name}.`);
      reader.readAsText(file);
      event.target.value = '';
    },
    [applyReport],
  );

  return {
    data,
    periodo,
    load,
    startDate,
    endDate,
    reprocessing,
    periodError,
    importError,
    changePeriod,
    importFile,
    dismissPeriodError: useCallback(() => setPeriodError(null), []),
    dismissImportError: useCallback(() => setImportError(null), []),
  };
}
