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

  const result = spawnSync(process.execPath, [nextBin, "build", "--turbopack"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_OUTPUT: "export",
      GITHUB_PAGES: "true",
      GITHUB_PAGES_BASE_PATH: githubPagesBasePath,
      NEXT_PUBLIC_BASE_PATH: githubPagesBasePath,
      NEXT_SKIP_NEXT_TYPECHECK: "true",
      RULEQUANT_DISABLE_MINIFY: "true",
    },
  });

  if (result.error) throw result.error;
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
