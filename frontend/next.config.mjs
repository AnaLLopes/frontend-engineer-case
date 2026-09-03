/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `next dev` e `next build` compartilham o mesmo diretório e se sobrescrevem:
  // buildar com o servidor de desenvolvimento de pé o derruba com HTTP 500.
  // Com NEXT_DIST_DIR é possível verificar um build em paralelo, sem colisão:
  //   NEXT_DIST_DIR=.next-verify npm run build
  //   NEXT_DIST_DIR=.next-verify npx next start -p 3100
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;
