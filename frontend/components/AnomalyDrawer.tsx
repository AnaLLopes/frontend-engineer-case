'use client';

import React, { useEffect, useRef } from 'react';
import { CustomerReport } from '@/types';
import { formatBRL, formatDate } from '@/lib/format';

interface AnomalyDrawerProps {
  customer: CustomerReport | null;
  onClose: () => void;
}

/** Elementos que recebem foco por `Tab`, na ordem em que aparecem no DOM. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const AnomalyDrawer: React.FC<AnomalyDrawerProps> = ({ customer, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!customer) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      // `aria-modal` só promete a semântica; o Tab precisa ser contido à mão,
      // senão o foco escapa para os controles atrás do overlay.
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusables = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus();
    };
  }, [customer, onClose]);

  if (!customer) return null;

  const suspiciousTotal = customer.pedidos_suspeitos.reduce((acc, order) => acc + order.value, 0);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="anomaly-drawer-title"
        className="fixed top-0 right-0 w-full sm:w-[450px] h-full bg-cw-card border-l border-cw-border z-50 p-6 flex flex-col shadow-2xl"
      >
        <div className="flex justify-between items-start gap-4 pb-4 border-b border-cw-border">
          <div>
            <h2 id="anomaly-drawer-title" className="text-lg font-bold text-white">
              {customer.nome}
            </h2>
            <p className="text-xs text-cw-muted font-mono">
              ID #{customer.customer_id} • {customer.categoria} • {customer.total_pedidos} pedido(s)
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-cw-muted hover:text-white focus-visible:ring-2 focus-visible:ring-cw-neon rounded text-2xl leading-none px-1"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <div className="mt-4 mb-4">
          <span className="text-xs font-semibold text-cw-danger uppercase tracking-wider block mb-1">
            Gatilho de risco identificado
          </span>
          <p className="text-xs text-cw-muted leading-relaxed">
            {customer.pedidos_suspeitos.length} pedido(s) com valor acima de{' '}
            <strong>3x a média dos pedidos do cliente no período</strong>, somando{' '}
            <strong className="text-white">{formatBRL(suspiciousTotal)}</strong>.
          </p>
        </div>

        <ul className="space-y-3 overflow-y-auto flex-1 pr-1 list-none">
          {customer.pedidos_suspeitos.map((order) => (
            <li
              key={order.order_id}
              className="bg-cw-elevated border-l-4 border-cw-danger p-4 rounded-r-lg"
            >
              <div className="flex justify-between text-xs text-cw-muted mb-1 font-mono">
                <span>Pedido #{order.order_id}</span>
                <time dateTime={order.date}>{formatDate(order.date)}</time>
              </div>
              <p className="text-xl font-mono font-bold text-cw-danger">{formatBRL(order.value)}</p>
              <dl className="text-xs mt-2 pt-2 border-t border-cw-border/50 space-y-1">
                <div className="flex justify-between text-cw-muted">
                  <dt>Média do cliente</dt>
                  <dd className="font-mono text-white">{formatBRL(order.customer_mean)}</dd>
                </div>
                <div className="flex justify-between text-cw-dim">
                  <dt>Limiar (3x a média)</dt>
                  <dd className="font-mono">{formatBRL(order.customer_mean * 3)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 py-2.5 bg-cw-elevated border border-cw-border text-white text-sm font-semibold rounded-lg hover:bg-cw-white/10 focus-visible:ring-2 focus-visible:ring-cw-neon transition"
        >
          Fechar auditoria
        </button>
      </aside>
    </>
  );
};
