import { AnalysisReport, CustomerReport, ReportPeriod, SuspiciousOrder, Tier } from '@/types';

const TIERS: readonly Tier[] = ['VIP', 'Regular'];

export class ReportFormatError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function num(source: Record<string, unknown>, key: string, where: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ReportFormatError(`${where}: campo "${key}" deveria ser numérico.`);
  }
  return value;
}

function str(source: Record<string, unknown>, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== 'string') {
    throw new ReportFormatError(`${where}: campo "${key}" deveria ser texto.`);
  }
  return value;
}

function parseSuspiciousOrder(raw: unknown, where: string): SuspiciousOrder {
  if (!isRecord(raw)) throw new ReportFormatError(`${where}: pedido suspeito inválido.`);
  return {
    order_id: num(raw, 'order_id', where),
    date: str(raw, 'date', where),
    value: num(raw, 'value', where),
    customer_mean: num(raw, 'customer_mean', where),
  };
}

function parseCustomer(raw: unknown, index: number): CustomerReport {
  const where = `registro ${index + 1}`;
  if (!isRecord(raw)) throw new ReportFormatError(`${where}: esperado um objeto de cliente.`);

  const categoria = str(raw, 'categoria', where);
  if (!TIERS.includes(categoria as Tier)) {
    throw new ReportFormatError(
      `${where}: categoria "${categoria}" fora do contrato (esperado ${TIERS.join(' ou ')}).`,
    );
  }

  const suspeitos = raw.pedidos_suspeitos;
  if (!Array.isArray(suspeitos)) {
    throw new ReportFormatError(`${where}: "pedidos_suspeitos" deveria ser uma lista.`);
  }

  return {
    customer_id: num(raw, 'customer_id', where),
    nome: str(raw, 'nome', where),
    categoria: categoria as Tier,
    total_pedidos: num(raw, 'total_pedidos', where),
    total_gasto_antes_desconto: num(raw, 'total_gasto_antes_desconto', where),
    desconto_aplicado_percentual: num(raw, 'desconto_aplicado_percentual', where),
    desconto_valor: num(raw, 'desconto_valor', where),
    total_gasto_apos_desconto: num(raw, 'total_gasto_apos_desconto', where),
    pedidos_suspeitos: suspeitos.map((order) => parseSuspiciousOrder(order, where)),
  };
}

/**
 * Reconhece os arquivos de entrada do desafio para dar uma mensagem útil quando
 * alguém importa `customers.json` ou `orders.csv` no lugar do relatório.
 */
function describeWrongFile(sample: unknown): string | null {
  if (!isRecord(sample)) return null;
  if ('categoria' in sample) return null;

  if ('tier' in sample && 'name' in sample && 'id' in sample) {
    return 'este parece ser o customers.json (campos id/name/tier), que é uma entrada do analyzer, não a saída.';
  }
  if ('value' in sample && 'customer_id' in sample && 'date' in sample) {
    return 'este parece ser o orders.csv convertido (campos customer_id/value/date), que é uma entrada do analyzer, não a saída.';
  }
  return null;
}

function parsePeriod(raw: unknown): ReportPeriod {
  if (!isRecord(raw)) throw new ReportFormatError('"periodo" deveria ser um objeto.');

  const bound = (key: 'data_inicial' | 'data_final'): string | null => {
    const value = raw[key];
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new ReportFormatError(`periodo.${key} deveria ser uma data YYYY-MM-DD ou nulo.`);
    }
    return value;
  };

  return { data_inicial: bound('data_inicial'), data_final: bound('data_final') };
}

/**
 * Aceita as duas formas do relatório: o envelope `{ periodo, clientes }` que o
 * analyzer gera hoje, e a lista pura de clientes. Na lista pura o período fica
 * `null` — desconhecido, e não "sem filtro".
 */
export function parseReport(payload: unknown): AnalysisReport {
  const asList = Array.isArray(payload) ? payload : null;
  const asEnvelope = !asList && isRecord(payload) && 'clientes' in payload ? payload : null;

  if (!asList && !asEnvelope) {
    throw new ReportFormatError(
      'o conteúdo deveria ser o envelope { periodo, clientes } ou uma lista de clientes — a saída de `analyzer.py --output`.',
    );
  }

  const clientes = asList ?? asEnvelope?.clientes;
  if (!Array.isArray(clientes)) {
    throw new ReportFormatError('"clientes" deveria ser uma lista.');
  }

  const wrongFile = describeWrongFile(clientes[0]);
  if (wrongFile) {
    throw new ReportFormatError(
      `${wrongFile} Importe o relatório gerado pelo analyzer, em frontend/public/report.json.`,
    );
  }

  return {
    periodo: asEnvelope ? parsePeriod(asEnvelope.periodo) : null,
    clientes: clientes.map(parseCustomer),
  };
}
