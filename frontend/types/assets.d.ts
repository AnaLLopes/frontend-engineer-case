/**
 * Declarações de módulos para assets importados por efeito colateral.
 *
 * O Next.js declara apenas `*.module.css` (em `next/types/global.d.ts`); folhas
 * de estilo globais como `app/globals.css` não têm declaração própria. Na CLI
 * isso não aparece — o TypeScript ignora imports sem bindings — mas o TS server
 * do editor sinaliza o import quando cai em "inferred project" (workspace aberto
 * na raiz do repositório, com o tsconfig em `frontend/`) ou antes de o
 * `next-env.d.ts` ser gerado pelo primeiro `next dev`/`next build`.
 */

declare module '*.css';
declare module '*.scss';
declare module '*.sass';
