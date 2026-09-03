import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mesmo alias do tsconfig.json, para os testes importarem como a aplicação.
    alias: { '@': path.resolve(import.meta.dirname, '.') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // O route handler roda no Node e é exercitado pelos testes de integração
    // do backend; aqui o foco é a camada de UI e o parsing do contrato.
    exclude: ['node_modules', '.next', '.next-verify'],
  },
});
