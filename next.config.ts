import type { NextConfig } from "next";

const isStaticExport = process.env.NEXT_OUTPUT === "export";
const githubPagesBasePath = process.env.GITHUB_PAGES === "true" ? (process.env.GITHUB_PAGES_BASE_PATH ?? "/rulequant-terminal-pages") : "";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : "standalone",
  basePath: githubPagesBasePath || undefined,
  assetPrefix: githubPagesBasePath || undefined,
  trailingSlash: isStaticExport,
  allowedDevOrigins: ["127.0.0.1"],
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
  ...(isStaticExport
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
                { key: "Referrer-Policy", value: "no-referrer" },
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
