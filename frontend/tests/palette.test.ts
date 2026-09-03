import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * O Tailwind gera CSS apenas para classes que existem no tema. Um token
 * inventado — `bg-cw-branco`, `text-cw-verde` — é ignorado em silêncio: não
 * quebra build, não aparece no lint, só não pinta nada.
 *
 * Este teste extrai a paleta do próprio `tailwind.config.ts` (a fonte de
 * verdade) e a compara com os tokens usados no código, em vez de manter uma
 * lista duplicada aqui que sairia de sincronia.
 */

const ROOT = path.resolve(__dirname, '..');

function paletteFromConfig(): string[] {
  const config = readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf-8');
  const bloco = config.match(/cw:\s*\{([\s\S]*?)\n\s*\},/);
  if (!bloco) throw new Error('bloco de cores `cw` não encontrado em tailwind.config.ts');
  return [...bloco[1]!.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*'/gm)].map((m) => m[1]!);
}

function sourceFiles(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
    }
  };
  dirs.forEach((d) => walk(path.join(ROOT, d)));
  return out;
}

describe('paleta Tailwind', () => {
  const paleta = paletteFromConfig();
  const arquivos = sourceFiles(['app', 'components', 'hooks', 'lib']);

  it('declara os tokens esperados', () => {
    expect(paleta).toContain('bg');
    expect(paleta).toContain('neon');
    expect(paleta).toContain('danger');
    expect(paleta.length).toBeGreaterThan(8);
  });

  it('varre arquivos de fonte de verdade', () => {
    expect(arquivos.length).toBeGreaterThan(5);
    expect(arquivos.some((f) => f.endsWith('page.tsx'))).toBe(true);
  });

  it.each(
    // Um caso por arquivo, para a falha apontar direto o culpado.
    arquivos.map((f) => path.relative(ROOT, f)),
  )('%s não usa token cw-* fora da paleta', (relativo) => {
    const conteudo = readFileSync(path.join(ROOT, relativo), 'utf-8');
    const usados = [...conteudo.matchAll(/-cw-([a-z0-9-]+)/g)]
      .map((m) => m[1]!.replace(/\/.*$/, ''))
      // `neon-dim` e `danger-dim` são tokens; `border-cw-danger/40` não é.
      .map((t) => (paleta.includes(t) ? t : t.replace(/-(\[.*)$/, '')));

    const desconhecidos = [...new Set(usados)].filter((t) => !paleta.includes(t));
    expect(desconhecidos).toEqual([]);
  });
});
