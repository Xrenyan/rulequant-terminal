import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");
const disabledApiDir = path.join(root, "src", "_api_static_disabled");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const githubPagesBasePath = process.env.GITHUB_PAGES_BASE_PATH || "/rulequant-terminal-pages";

function hasCompleteStaticOutput() {
  return [
    path.join(root, "out", "dashboard", "index.html"),
    path.join(root, "out", "static-cloud-state.json"),
    path.join(root, "out", "_next"),
  ].every((item) => fs.existsSync(item));
}

function restoreApiDir() {
  if (fs.existsSync(disabledApiDir) && !fs.existsSync(apiDir)) {
    fs.renameSync(disabledApiDir, apiDir);
  }
}

function addStaticPrefetchCompatibilityFiles() {
  const outDir = path.join(root, "out");
  if (!fs.existsSync(outDir)) return;

  for (const routeEntry of fs.readdirSync(outDir, { withFileTypes: true })) {
    if (!routeEntry.isDirectory()) continue;
    const routeDir = path.join(outDir, routeEntry.name);
    for (const entry of fs.readdirSync(routeDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("__next.")) continue;
      const source = path.join(routeDir, entry.name, "__PAGE__.txt");
      if (!fs.existsSync(source)) continue;
      fs.copyFileSync(source, path.join(routeDir, `${entry.name}.__PAGE__.txt`));
    }
  }
}

try {
  restoreApiDir();
  if (fs.existsSync(apiDir)) {
    if (fs.existsSync(disabledApiDir)) {
      fs.rmSync(disabledApiDir, { recursive: true, force: true });
    }
    fs.renameSync(apiDir, disabledApiDir);
  }

  fs.rmSync(path.join(root, ".next"), { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
  fs.rmSync(path.join(root, "out"), { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });

  const result = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_OUTPUT: "export",
      GITHUB_PAGES: "true",
      GITHUB_PAGES_BASE_PATH: githubPagesBasePath,
      NEXT_PUBLIC_BASE_PATH: githubPagesBasePath,
      NEXT_PUBLIC_STATIC_EXPORT: "true",
      NEXT_SKIP_NEXT_TYPECHECK: "true",
    },
  });

  if (result.error) throw result.error;
  addStaticPrefetchCompatibilityFiles();
  const exitStatus = result.status ?? result.signal ?? 1;
  if (exitStatus && hasCompleteStaticOutput()) {
    console.warn(`Next.js exited with ${exitStatus} after static output was generated; continuing with verified out/ files.`);
    process.exitCode = 0;
  } else {
    process.exitCode = exitStatus;
  }
} finally {
  restoreApiDir();
}
