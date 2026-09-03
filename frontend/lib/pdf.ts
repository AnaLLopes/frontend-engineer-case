import { CustomerReport, ReportPeriod, TierFilter } from '@/types';
import { formatBRL, formatDate, formatPeriod } from '@/lib/format';

export interface ExportFilters {
  search: string;
  tier: TierFilter;
  onlyAnomalies: boolean;
}

interface ExportInput {
  clientes: CustomerReport[];
  periodo: ReportPeriod | null;
  filtros: ExportFilters;
  /** Total da base, para deixar claro quando o PDF cobre um subconjunto. */
  totalClientes: number;
}

const NEON: [number, number, number] = [0, 138, 60];
const DANGER: [number, number, number] = [200, 30, 70];
const INK: [number, number, number] = [24, 24, 30];
const MUTED: [number, number, number] = [110, 110, 120];

const MARGIN = 14;

/** Descreve os filtros ativos, ou `null` quando o PDF cobre a base inteira. */
function describeFilters({ search, tier, onlyAnomalies }: ExportFilters): string | null {
  const parts: string[] = [];
  if (search.trim()) parts.push(`busca "${search.trim()}"`);
  if (tier !== 'ALL') parts.push(`categoria ${tier}`);
  if (onlyAnomalies) parts.push('apenas clientes anômalos');
  return parts.length ? parts.join(' · ') : null;
}

function buildFileName(periodo: ReportPeriod | null): string {
  const inicio = periodo?.data_inicial;
  const fim = periodo?.data_final;
  if (inicio && fim) return `relatorio-pedidos-${inicio}_a_${fim}.pdf`;
  if (inicio) return `relatorio-pedidos-desde-${inicio}.pdf`;
  if (fim) return `relatorio-pedidos-ate-${fim}.pdf`;
  return 'relatorio-pedidos-completo.pdf';
}

export async function exportReportPdf({
  clientes,
  periodo,
  filtros,
  totalClientes,
}: ExportInput): Promise<string> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const totals = clientes.reduce(
    (acc, c) => ({
      bruto: acc.bruto + c.total_gasto_antes_desconto,
      liquido: acc.liquido + c.total_gasto_apos_desconto,
      desconto: acc.desconto + c.desconto_valor,
      pedidos: acc.pedidos + c.total_pedidos,
      suspeitos: acc.suspeitos + c.pedidos_suspeitos.length,
    }),
    { bruto: 0, liquido: 0, desconto: 0, pedidos: 0, suspeitos: 0 },
  );

  // ---------------------------------------------------------------- cabeçalho
  doc.setFillColor(...INK);
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(...NEON);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('CloudWalk', MARGIN, 12);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text('Relatório de Análise de Pedidos', MARGIN + 30, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(190, 190, 200);
  const periodoLabel = formatPeriod(periodo) ?? 'todos os pedidos do arquivo';
  doc.text(`Período analisado: ${periodoLabel}`, MARGIN, 20);

  let cursor = 34;

  const filtrosLabel = describeFilters(filtros);
  if (filtrosLabel) {
    doc.setTextColor(...DANGER);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(
      `Recorte: ${filtrosLabel} — ${clientes.length} de ${totalClientes} clientes da base`,
      MARGIN,
      cursor,
    );
    cursor += 7;
  }

  // -------------------------------------------------------------------- resumo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text('Resumo', MARGIN, cursor);
  cursor += 2;

  autoTable(doc, {
    startY: cursor,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: { top: 2, bottom: 2, left: 0, right: 4 } },
    body: [
      ['Clientes', String(clientes.length)],
      ['Pedidos no período', String(totals.pedidos)],
      ['Total gasto antes do desconto', formatBRL(totals.bruto)],
      ['Descontos concedidos', formatBRL(totals.desconto)],
      ['Total gasto após o desconto', formatBRL(totals.liquido)],
      ['Pedidos suspeitos', String(totals.suspeitos)],
    ],
    columnStyles: {
      0: { textColor: MUTED, cellWidth: 70 },
      1: { fontStyle: 'bold', textColor: INK },
    },
  });

  cursor = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // ------------------------------------------------- consolidado por cliente
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Consolidado por cliente', MARGIN, cursor);

  autoTable(doc, {
    startY: cursor + 2,
    margin: { left: MARGIN, right: MARGIN },
    head: [['ID', 'Cliente', 'Categoria', 'Pedidos', 'Bruto', 'Desc.', 'Líquido', 'Susp.']],
    body: clientes.map((c) => [
      String(c.customer_id),
      c.nome,
      c.categoria,
      String(c.total_pedidos),
      formatBRL(c.total_gasto_antes_desconto),
      c.desconto_aplicado_percentual > 0 ? `${c.desconto_aplicado_percentual}%` : '—',
      formatBRL(c.total_gasto_apos_desconto),
      c.pedidos_suspeitos.length > 0 ? String(c.pedidos_suspeitos.length) : '—',
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.6, textColor: INK, lineColor: [225, 225, 230] },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontSize: 7.5, halign: 'left' },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    columnStyles: {
      0: { cellWidth: 11, textColor: MUTED },
      2: { cellWidth: 19 },
      3: { cellWidth: 15, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 15, halign: 'right' },
      6: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 13, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 7 && data.cell.raw !== '—') {
        data.cell.styles.textColor = DANGER;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ---------------------------------------------------------- pedidos suspeitos
  const suspeitos = clientes.flatMap((c) =>
    c.pedidos_suspeitos.map((o) => ({ cliente: c.nome, categoria: c.categoria, ...o })),
  );

  if (suspeitos.length > 0) {
    doc.addPage();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text('Pedidos suspeitos', MARGIN, 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      'Pedidos cujo valor supera 3x a média dos pedidos do próprio cliente no período.',
      MARGIN,
      25.5,
    );

    autoTable(doc, {
      startY: 30,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Pedido', 'Cliente', 'Categoria', 'Data', 'Valor', 'Média', 'Limiar (3x)']],
      body: suspeitos.map((o) => [
        `#${o.order_id}`,
        o.cliente,
        o.categoria,
        formatDate(o.date),
        formatBRL(o.value),
        formatBRL(o.customer_mean),
        formatBRL(o.customer_mean * 3),
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.6, textColor: INK, lineColor: [225, 225, 230] },
      headStyles: { fillColor: DANGER, textColor: [255, 255, 255], fontSize: 7.5, halign: 'left' },
      alternateRowStyles: { fillColor: [253, 246, 248] },
      columnStyles: {
        0: { cellWidth: 17 },
        2: { cellWidth: 19 },
        3: { cellWidth: 20 },
        4: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: DANGER },
        5: { cellWidth: 26, halign: 'right' },
        6: { cellWidth: 26, halign: 'right', textColor: MUTED },
      },
    });
  }

  // ------------------------------------------------------------------- rodapé
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('Gerado por backend/analyzer.py', MARGIN, pageHeight - 8);
    doc.text(`Página ${page} de ${pageCount}`, pageWidth - MARGIN, pageHeight - 8, {
      align: 'right',
    });
  }

  const fileName = buildFileName(periodo);
  doc.save(fileName);
  return fileName;
}
