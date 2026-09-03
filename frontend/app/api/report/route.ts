import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

/**
 * Reprocessa o relatório para um período, executando `backend/analyzer.py`.
 *
 * O filtro de datas da interface passa por aqui em vez de recalcular no cliente:
 * as regras de negócio (10% VIP, 5% Regular acima de R$ 500, mínimo de 2 pedidos
 * no período, anomalia acima de 3x a média) ficam só no Python. Reimplementá-las
 * em TypeScript criaria duas fontes de verdade para a mesma regra financeira,
 * que é justamente o que não se quer numa auditoria.
 *
 * GET /api/report                              -> relatório completo
 * GET /api/report?start=2025-01-01&end=...     -> relatório do período
 */

// Nunca pré-renderizar: a resposta depende da query e do estado dos arquivos.
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMEOUT_MS = 20_000;

const PYTHON_BIN = process.env.PYTHON_BIN ?? 'python3';
/** A raiz do repositório: o Next roda com cwd em `frontend/`. */
const REPO_ROOT = process.env.REPO_ROOT ?? path.resolve(process.cwd(), '..');
const ANALYZER = process.env.ANALYZER_PATH ?? path.join(REPO_ROOT, 'backend', 'analyzer.py');

interface AnalyzerResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runAnalyzer(args: string[]): Promise<AnalyzerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [ANALYZER, ...args], { cwd: REPO_ROOT, shell: false });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`o analyzer excedeu ${TIMEOUT_MS / 1000}s e foi interrompido.`));
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const start = params.get('start');
  const end = params.get('end');

  for (const [name, value] of [
    ['start', start],
    ['end', end],
  ] as const) {
    if (value !== null && value !== '' && !ISO_DATE.test(value)) {
      return NextResponse.json(
        { error: `O parâmetro "${name}" deve estar no formato YYYY-MM-DD.` },
        { status: 400 },
      );
    }
  }

  if (!existsSync(ANALYZER)) {
    return NextResponse.json(
      { error: `analyzer.py não encontrado em ${ANALYZER}.` },
      { status: 503 },
    );
  }

  const args: string[] = [];
  if (start) args.push('--start-date', start);
  if (end) args.push('--end-date', end);

  let result: AnalyzerResult;
  try {
    result = await runAnalyzer(args);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isMissingPython = message.includes('ENOENT');
    return NextResponse.json(
      {
        error: isMissingPython
          ? `"${PYTHON_BIN}" não foi encontrado no PATH do servidor. O filtro de período precisa do Python para reprocessar o relatório.`
          : `Falha ao executar o analyzer: ${message}`,
      },
      { status: 503 },
    );
  }

  if (result.code !== 0) {
    const detail =
      result.stderr
        .split('\n')
        .find((line) => line.startsWith('[erro]'))
        ?.replace('[erro] ', '') ?? result.stderr.trim();
    return NextResponse.json(
      { error: detail || `O analyzer terminou com código ${result.code}.` },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(JSON.parse(result.stdout));
  } catch {
    return NextResponse.json(
      { error: 'O analyzer não devolveu um JSON válido.' },
      { status: 502 },
    );
  }
}
