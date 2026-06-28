import type { NextConfig } from "next";

const isStaticExport = process.env.NEXT_OUTPUT === "export";
const githubPagesBasePath = process.env.GITHUB_PAGES === "true" ? (process.env.GITHUB_PAGES_BASE_PATH ?? "/rulequant-terminal-pages") : "";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : "standalone",
  basePath: githubPagesBasePath || undefined,
  assetPrefix: githubPagesBasePath || undefined,
  trailingSlash: isStaticExport,
  typescript: {
    ignoreBuildErrors: process.env.NEXT_SKIP_NEXT_TYPECHECK === "true",
  },
  experimental: {
    cpus: 2,
    staticGenerationMaxConcurrency: 2,
    staticGenerationMinPagesPerWorker: 20,
  },
  images: {
    unoptimized: isStaticExport,
  },
  webpack: (config, { dev }) => {
    if (!dev && process.env.RULEQUANT_DISABLE_MINIFY === "true") {
      config.optimization.minimize = false;
    }
    return config;
  },
};

export default nextConfig;
