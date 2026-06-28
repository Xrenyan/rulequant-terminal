import type { NextConfig } from "next";

const isStaticExport = process.env.NEXT_OUTPUT === "export";
const githubPagesBasePath = process.env.GITHUB_PAGES === "true" ? (process.env.GITHUB_PAGES_BASE_PATH ?? "/rulequant-terminal-pages") : "";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : "standalone",
  basePath: githubPagesBasePath || undefined,
  assetPrefix: githubPagesBasePath || undefined,
  trailingSlash: isStaticExport,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: isStaticExport,
  },
};

export default nextConfig;
