import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // AGENTS.md es el contrato de Codex: la herramienta no debe modificarlo.
  agentRules: false,
};

export default nextConfig;
