import React from 'react';

interface DashboardHeaderProps {
  onExportPdf: () => void;
  exporting: boolean;
  canExport: boolean;
  onImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  onExportPdf,
  exporting,
  canExport,
  onImportFile,
}) => (
  <header className="border-b border-cw-border bg-cw-card px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
    <div className="flex items-center gap-3">
      <div
        aria-hidden="true"
        className="w-8 h-8 rounded-lg bg-cw-white text-black font-extrabold flex items-center justify-center font-mono text-sm"
      >
        CW
      </div>
      <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2 flex-wrap">
        CloudWalk
        <span className="text-xs px-2 py-0.5 rounded-full border border-cw-border text-cw-muted font-normal">
          Case
        </span>
      </h1>
    </div>

    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onExportPdf}
        disabled={exporting || !canExport}
        title={
          canExport
            ? 'Exporta em PDF exatamente o que está na tela'
            : 'Carregue um relatório para exportar'
        }
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cw-neon text-black text-xs font-bold hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {exporting ? 'Gerando PDF…' : 'Exportar relatório (PDF)'}
      </button>

      <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cw-white border border-cw-border text-xs font-semibold text-black hover:border-cw-neon focus-within:border-cw-neon transition">
        <span>Importar report.json</span>
        <input
          type="file"
          accept="application/json,.json"
          onChange={onImportFile}
          className="sr-only"
        />
      </label>
    </div>
  </header>
);
