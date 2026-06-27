import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");
const disabledApiDir = path.join(root, "src", "app", "_api_static_disabled");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const githubPagesBasePath = process.env.GITHUB_PAGES_BASE_PATH || "/rulequant-terminal";

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

  fs.rmSync(path.join(root, ".next"), { recursive: true, force: true });

  const result = spawnSync(pnpm, ["build"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NEXT_OUTPUT: "export",
      GITHUB_PAGES: "true",
      GITHUB_PAGES_BASE_PATH: githubPagesBasePath,
      NEXT_PUBLIC_BASE_PATH: githubPagesBasePath,
    },
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  restoreApiDir();
}
