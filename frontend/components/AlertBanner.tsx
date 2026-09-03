import React from 'react';

/**
 * Aviso dispensável usado pelos três erros não bloqueantes da tela — período não
 * aplicado, importação recusada e falha ao exportar. Todos preservam os dados já
 * carregados, então nenhum deles substitui a tabela: apenas explicam o que
 * falhou, acima dela.
 */
interface AlertBannerProps {
  title: string;
  message: string;
  dismissLabel: string;
  onDismiss: () => void;
  children?: React.ReactNode;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  title,
  message,
  dismissLabel,
  onDismiss,
  children,
}) => (
  <div
    role="alert"
    className="mb-6 rounded-xl border border-cw-danger bg-cw-danger-dim p-4 text-sm flex items-start justify-between gap-4"
  >
    <div>
      <p className="font-semibold text-cw-danger mb-1">{title}</p>
      <p className="text-cw-muted">{message}</p>
      {children && <p className="text-cw-dim text-xs mt-2">{children}</p>}
    </div>
    <button
      type="button"
      onClick={onDismiss}
      aria-label={dismissLabel}
      className="text-cw-muted hover:text-white focus-visible:ring-2 focus-visible:ring-cw-neon rounded text-xl leading-none px-1"
    >
      <span aria-hidden="true">&times;</span>
    </button>
  </div>
);
