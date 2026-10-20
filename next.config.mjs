/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/investimentos/relatorios-email/preview": ["./public/Logo.png"],
    "/api/investimentos/relatorios-email/enviar": ["./public/Logo.png"],
    "/api/cron/investimentos-relatorios": ["./public/Logo.png"],
  },
};

export default nextConfig;
