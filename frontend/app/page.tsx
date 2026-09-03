'use client';

import React, { useCallback, useState } from 'react';
import { CustomerReport } from '@/types';
import { formatPeriod } from '@/lib/format';
import { exportReportPdf } from '@/lib/pdf';
import { useReport } from '@/hooks/useReport';
import { useCustomerFilters } from '@/hooks/useCustomerFilters';
import { DashboardHeader } from '@/components/DashboardHeader';
import { MetricCards } from '@/components/MetricCards';
import { FiltersBar } from '@/components/FiltersBar';
import { CustomersTable } from '@/components/CustomersTable';
import { AnomalyDrawer } from '@/components/AnomalyDrawer';
import { AlertBanner } from '@/components/AlertBanner';

export default function DashboardPage() {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerReport | null>(null);
  const clearSelection = useCallback(() => setSelectedCustomer(null), []);

  const {
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
    dismissPeriodError,
    dismissImportError,
  } = useReport({ onDatasetReplaced: clearSelection });

  const filters = useCustomerFilters(data);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportReportPdf({
        clientes: filters.filtered,
        periodo,
        filtros: {
          search: filters.search,
          tier: filters.tier,
          onlyAnomalies: filters.onlyAnomalies,
        },
        totalClientes: data.length,
      });
    } catch (error: unknown) {
      setExportError(error instanceof Error ? error.message : 'Não foi possível gerar o PDF.');
    } finally {
      setExporting(false);
    }
  }, [filters.filtered, filters.search, filters.tier, filters.onlyAnomalies, periodo, data.length]);

  const periodLabel = formatPeriod(periodo);
  // Um período sem pedidos não devolve lista vazia: o analyzer devolve a base
  // inteira com tudo zerado, para a auditoria ver que os clientes existem.
  const emptyPeriod = data.length > 0 && data.every((customer) => customer.total_pedidos === 0);
  const dimWhileReprocessing = reprocessing
    ? 'opacity-50 transition-opacity'
    : 'transition-opacity';

  return (
    <main className="min-h-screen flex flex-col">
      <DashboardHeader
        onExportPdf={handleExportPdf}
        exporting={exporting}
        canExport={filters.filtered.length > 0}
        onImportFile={importFile}
      />

      <div className="flex-1 max-w-7xl w-full mx-auto p-6">
        {load.status === 'ready' && (
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
            {periodLabel && (
              <span className="inline-flex items-center gap-2 rounded-full border border-cw-border bg-cw-card px-3 py-1.5">
                <span className="text-white uppercase tracking-wider font-semibold">
                  Período analisado
                </span>
                <span className="font-mono text-white">{periodLabel}</span>
              </span>
            )}
            <span className="text-cw-dim font-mono">fonte: {load.source}</span>
          </div>
        )}

        <div className={dimWhileReprocessing}>
          <MetricCards
            data={filters.filtered}
            totalCustomers={data.length}
            isFiltered={filters.isFiltered}
          />
        </div>

        <FiltersBar
          search={filters.search}
          onSearchChange={filters.setSearch}
          tier={filters.tier}
          onTierChange={filters.setTier}
          onlyAnomalies={filters.onlyAnomalies}
          onOnlyAnomaliesChange={filters.setOnlyAnomalies}
          startDate={startDate}
          endDate={endDate}
          onPeriodChange={changePeriod}
          reprocessing={reprocessing}
        />

        {periodError && (
          <AlertBanner
            title="Período não aplicado"
            message={periodError}
            dismissLabel="Dispensar aviso de período"
            onDismiss={dismissPeriodError}
          />
        )}

        {exportError && (
          <AlertBanner
            title="Falha ao exportar o PDF"
            message={exportError}
            dismissLabel="Dispensar aviso de exportação"
            onDismiss={() => setExportError(null)}
          />
        )}

        {importError && (
          <AlertBanner
            title="Importação recusada"
            message={importError}
            dismissLabel="Dispensar aviso de importação"
            onDismiss={dismissImportError}
          >
            Os dados abaixo continuam sendo os do relatório carregado antes.
          </AlertBanner>
        )}

        <div aria-live="polite" aria-busy={load.status === 'loading' || reprocessing}>
          {load.status === 'loading' && (
            <p className="text-center py-20 text-cw-muted font-mono">
              Carregando inteligência de pedidos…
            </p>
          )}

          {load.status === 'error' && (
            <div
              role="alert"
              className="rounded-xl border border-cw-danger bg-cw-danger-dim p-6 text-sm"
            >
              <p className="font-semibold text-cw-danger mb-1">Relatório não carregado</p>
              <p className="text-cw-muted mb-3">{load.message}</p>
              {load.showGenerateHint && (
                <p className="text-cw-dim font-mono text-xs">
                  python3 backend/analyzer.py --output frontend/public/report.json
                </p>
              )}
            </div>
          )}

          {load.status === 'empty' && (
            <p className="text-center py-20 text-cw-muted">
              O relatório carregou, mas não contém clientes.
            </p>
          )}

          {load.status === 'ready' && (
            <div className={dimWhileReprocessing}>
              {emptyPeriod && (
                <p className="mb-4 rounded-xl border border-cw-border bg-cw-elevated px-4 py-3 text-xs text-cw-muted">
                  Nenhum pedido no período selecionado. Os {data.length} clientes da base
                  aparecem zerados — a lista completa é mantida de propósito, para a auditoria
                  ver que os cadastros existem.
                </p>
              )}
              <CustomersTable data={filters.filtered} onSelectCustomer={setSelectedCustomer} />
            </div>
          )}
        </div>
      </div>

      <AnomalyDrawer customer={selectedCustomer} onClose={clearSelection} />
    </main>
  );
}
