import React from 'react';
import { TierFilter } from '@/types';

interface FiltersBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  tier: TierFilter;
  onTierChange: (value: TierFilter) => void;
  onlyAnomalies: boolean;
  onOnlyAnomaliesChange: (value: boolean) => void;
  startDate: string;
  endDate: string;
  onPeriodChange: (start: string, end: string) => void;
  reprocessing: boolean;
}

const inputClass =
  'bg-cw-bg border border-cw-border text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-cw-neon focus-visible:ring-1 focus-visible:ring-cw-neon transition disabled:opacity-50';

export const FiltersBar: React.FC<FiltersBarProps> = ({
  search,
  onSearchChange,
  tier,
  onTierChange,
  onlyAnomalies,
  onOnlyAnomaliesChange,
  startDate,
  endDate,
  onPeriodChange,
  reprocessing,
}) => {
  const hasPeriod = Boolean(startDate || endDate);

  return (
    <section className="bg-cw-card border border-cw-border rounded-xl mb-6 divide-y divide-cw-border">
      {/* Período: reprocessa no backend */}
      <div className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="filtro-inicio"
            className="block text-xs text-cw-muted mb-1.5 font-semibold"
          >
            Período — de
          </label>
          <input
            id="filtro-inicio"
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => onPeriodChange(event.target.value, endDate)}
            className={`${inputClass} [color-scheme:dark]`}
          />
        </div>

        <div>
          <label htmlFor="filtro-fim" className="block text-xs text-cw-muted mb-1.5 font-semibold">
            até
          </label>
          <input
            id="filtro-fim"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => onPeriodChange(startDate, event.target.value)}
            className={`${inputClass} [color-scheme:dark]`}
          />
        </div>

        {hasPeriod && (
          <button
            type="button"
            onClick={() => onPeriodChange('', '')}
            disabled={reprocessing}
            className="px-3 py-2 rounded-lg border border-cw-border text-xs font-semibold text-cw-muted hover:text-white hover:border-cw-neon focus-visible:ring-2 focus-visible:ring-cw-neon transition disabled:opacity-50"
          >
            Limpar período
          </button>
        )}

        <p className="text-xs text-cw-dim flex-1 min-w-[220px] leading-relaxed">
          {reprocessing ? (
            <span className="text-cw-neon font-mono">Reprocessando no analyzer…</span>
          ) : (
            '* Muda o recorte da análise: descontos e anomalias são recalculados pelo backend.'
          )}
        </p>
      </div>

      {/* Filtros locais sobre o resultado já calculado */}
      <div className="p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[280px]">
          <div className="relative flex-1 min-w-[240px]">
            <label htmlFor="filtro-busca" className="sr-only">
              Buscar cliente por nome ou ID
            </label>
            <input
              id="filtro-busca"
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar por nome do cliente ou ID exato…"
              className={`${inputClass} w-full py-2.5`}
            />
          </div>

          <label htmlFor="filtro-tier" className="sr-only">
            Filtrar por categoria
          </label>
          <select
            id="filtro-tier"
            value={tier}
            onChange={(event) => onTierChange(event.target.value as TierFilter)}
            className={`${inputClass} py-2.5 cursor-pointer`}
          >
            <option value="ALL">Todas as categorias</option>
            <option value="VIP">Apenas VIP</option>
            <option value="Regular">Apenas Regular</option>
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyAnomalies}
            onChange={(event) => onOnlyAnomaliesChange(event.target.checked)}
            className="sr-only peer"
          />
          <span className="relative w-11 h-6 bg-cw-elevated border border-cw-border rounded-full transition-colors peer-checked:bg-cw-danger peer-focus-visible:ring-2 peer-focus-visible:ring-cw-neon after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-cw-muted after:rounded-full after:h-[18px] after:w-[18px] after:transition-transform peer-checked:after:translate-x-full peer-checked:after:bg-cw-white" />
          <span className="text-sm font-medium text-cw-muted">Apenas anômalos</span>
        </label>
      </div>
    </section>
  );
};
