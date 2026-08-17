# RuleQuant Development Environment Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore `D:\rulequant-terminal` as a reproducible Git-backed development checkout that passes tests and builds, then supports GitHub Pages and Vercel from one public repository.

**Architecture:** Preserve the migrated business files as the local source of truth, use the previously published GitHub repository as the preferred source for reproducible root configuration and history, and reconstruct only files that are absent from both. GitHub Pages receives a static export while Vercel receives the normal Next.js application with API routes.

**Tech Stack:** Next.js 16.2.11, React 19.2.4, TypeScript 5.9.3, pnpm 11.19.0, Vitest 4.1.9, Zustand 5.0.14, Dexie, Recharts 3.8.1, GitHub Actions, GitHub Pages, Vercel

## Global Constraints

- Use `D:\rulequant-terminal` as the only working checkout.
- Preserve the original ZIP, migrated source, static state, `out`, and `output` contents until the recovery is verified.
- Do not commit `node_modules`, `.next`, `out`, `output`, browser profiles, logs, local databases, deployment staging directories, or real environment files.
- Do not overwrite remote branches or deploy production until local tests, type checking, the normal build, and the static export have fresh successful results.
- Treat all `NEXT_PUBLIC_*` values as public; never store a real secret in them.
- Keep GitHub Pages and Vercel deployment paths independently testable.

---

### Task 1: Install GitHub CLI and resolve the existing repository

**Files:**
- Inspect: `D:\rulequant-terminal`
- Do not modify project files in this task.

**Interfaces:**
- Consumes: The user's Windows session and existing GitHub account.
- Produces: An authenticated `gh` command, the exact `owner/repository` identifier, default branch, clone URL, Pages URL, and existing workflow list.

- [ ] **Step 1: Install GitHub CLI**

Run:

```powershell
winget install --id GitHub.cli --exact --accept-package-agreements --accept-source-agreements --silent
```

- [ ] **Step 2: Verify the installed executable**

Run:

```powershell
& "$env:ProgramFiles\GitHub CLI\gh.exe" --version
```

Expected: exit code 0 and a GitHub CLI version.

- [ ] **Step 3: Authenticate through GitHub's browser flow if needed**

Run:

```powershell
& "$env:ProgramFiles\GitHub CLI\gh.exe" auth status
& "$env:ProgramFiles\GitHub CLI\gh.exe" auth login --hostname github.com --git-protocol https --web
```

Expected: `gh auth status` reports the authenticated user. The login command is skipped when the first command already succeeds.

- [ ] **Step 4: Locate the previously published repository**

Run:

```powershell
& "$env:ProgramFiles\GitHub CLI\gh.exe" repo list --limit 100 --json name,nameWithOwner,url,visibility,defaultBranchRef,homepageUrl,updatedAt
```

Filter the structured results for names, descriptions, or homepage URLs containing `rulequant`. Confirm the candidate by checking for `src/components/rulequant-terminal.tsx` and matching application title.

- [ ] **Step 5: Record remote metadata without mutating it**

Run `gh repo view` for the resolved repository with `--json nameWithOwner,url,defaultBranchRef,homepageUrl,visibility`, then list `.github/workflows` and root configuration through `gh api repos/{owner}/{repo}/contents`.

### Task 2: Attach Git history without overwriting migrated business files

**Files:**
- Preserve: `src/**`, `tests/**`, `scripts/**`, `public/**`, `out/**`, `output/**`
- Create temporarily: a sibling comparison checkout under a system-generated temporary directory
- Restore: `.git/**` only after the repository identity is confirmed

**Interfaces:**
- Consumes: Resolved repository and default branch from Task 1.
- Produces: A local Git checkout whose working tree shows the migrated differences explicitly.

- [ ] **Step 1: Clone the old repository into a unique temporary directory**

Use `New-Item` under `[System.IO.Path]::GetTempPath()` with a GUID name, then run `gh repo clone owner/repository <temp-path>`.

- [ ] **Step 2: Compare source-bearing directories before attaching Git metadata**

Run `git diff --no-index --stat` separately for `src`, `tests`, `scripts`, and `public`. Save the human-readable summary in `docs/migration/remote-comparison.md`, excluding secret values and generated browser output.

- [ ] **Step 3: Copy only the temporary checkout's `.git` directory into the D-drive project**

Verify both resolved absolute paths first. Copy `.git` to `D:\rulequant-terminal\.git`; do not copy or mirror the temporary working tree.

- [ ] **Step 4: Verify the resulting working tree**

Run:

```powershell
git -C D:\rulequant-terminal status --short --branch
git -C D:\rulequant-terminal remote -v
```

Expected: the correct remote/default branch is present, and migrated differences are visible rather than overwritten.

### Task 3: Restore reproducible project configuration and safe repository boundaries

**Files:**
- Restore or create: `package.json`
- Restore or create: `pnpm-lock.yaml`
- Restore or create: `tsconfig.json`
- Restore or create: `next.config.ts`
- Restore or create: `postcss.config.mjs`
- Restore or create: `vitest.config.ts`
- Restore or create: `.gitignore`
- Create: `.env.example`
- Restore or create: `README.md`
- Restore or create: `data/sample-draws.json`
- Restore or create: `data/sample-rules.json`
- Modify only if needed: `scripts/*.ps1`

**Interfaces:**
- Consumes: Old repository root configuration, source imports, and pnpm store versions.
- Produces: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm build:static` scripts.

- [ ] **Step 1: Restore unchanged root files from the confirmed default branch**

For every missing file listed above that exists in the remote checkout, copy it from the temporary checkout with metadata preserved. Do not restore `.env`, `.vercel`, generated output, or machine-specific configuration.

- [ ] **Step 2: Reconstruct only root files absent remotely**

Use exact dependency versions already present in `node_modules/.pnpm`, source import inventory, and framework requirements. `package.json` must declare `packageManager: pnpm@11.19.0` and scripts named `dev`, `test`, `typecheck`, `build`, and `build:static`.

- [ ] **Step 3: Restore sample JSON safely**

Prefer remote `data/sample-draws.json` and `data/sample-rules.json`. If absent remotely, derive the records from `public/static-cloud-state.json` using the exact `DrawRecord[]` and `RuleRecord[]` fields consumed by `src/lib/data/seed.ts`; validate them by importing the seed module in the test suite.

- [ ] **Step 4: Write repository ignore rules**

The ignore file must include:

```gitignore
node_modules/
.next/
out/
output/
release/
.vercel/
*.log
*.tsbuildinfo
.env
.env.*
!.env.example
```

- [ ] **Step 5: Remove machine-specific default paths from publish scripts**

Set each PowerShell script's default project root from `$PSScriptRoot` and its parent directory rather than `D:\RuleQuant\rulequant-terminal`. Keep deployment/output targets outside the repository and validate them before any mirror/delete operation.

- [ ] **Step 6: Remove the hard-coded client access token fallback**

Change `src/lib/security/private-access.ts` so `RULEQUANT_ACCESS_TOKEN` uses only the trimmed `NEXT_PUBLIC_RULEQUANT_ACCESS_TOKEN` value and treats an empty value as gate-disabled. Update security tests to prove an absent token never grants secret access and a configured token still compares after normalization.

- [ ] **Step 7: Install dependencies from a clean link farm**

Move the migrated, incomplete `node_modules` directory to a uniquely named local backup outside the repository, run `pnpm install --frozen-lockfile`, and retain the backup until full verification passes.

### Task 4: Restore GitHub Pages and Vercel deployment configuration

**Files:**
- Restore or create: `.github/workflows/ci.yml`
- Restore or create: `.github/workflows/pages.yml`
- Restore or create: `vercel.json` only if remote history proves custom configuration is required
- Modify if needed: `scripts/build-static-pages.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: Project scripts from Task 3.
- Produces: A CI workflow, a Pages workflow publishing `out`, and Vercel-compatible standard Next.js build behavior.

- [ ] **Step 1: Restore compatible workflows from the old repository**

Prefer the last successful old workflows, then update Node and pnpm versions to match `package.json`. CI must run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, and `pnpm build`.

- [ ] **Step 2: Configure GitHub Pages static export**

Pages workflow must grant `contents: read`, `pages: write`, and `id-token: write`; invoke `pnpm build:static`; upload `out` with `actions/upload-pages-artifact`; deploy with `actions/deploy-pages`.

- [ ] **Step 3: Preserve Vercel's full Next.js mode**

The normal `pnpm build` must not set static-export environment variables or disable API routes. Do not create `vercel.json` when framework auto-detection suffices.

- [ ] **Step 4: Document deployment variables without values**

README and `.env.example` must list the server-only database, GitHub state, cron, source synchronization, and admin variables referenced by source. Mark `NEXT_PUBLIC_*` values as public build-time configuration.

### Task 5: Verify local recovery from a clean state

**Files:**
- Read: all project files
- Generated and ignored: `node_modules/**`, `.next/**`, `out/**`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: Fresh evidence for dependency installation, tests, type checking, normal build, static export, and repository cleanliness.

- [ ] **Step 1: Run the full automated test suite**

Run `pnpm test -- --run`. Expected: zero failed tests.

- [ ] **Step 2: Run TypeScript type checking**

Run `pnpm typecheck`. Expected: exit code 0.

- [ ] **Step 3: Run the normal production build**

Run `pnpm build`. Expected: exit code 0 with all application and API routes compiled.

- [ ] **Step 4: Run the GitHub Pages static export**

Run `pnpm build:static`. Expected: exit code 0 and an `out/index.html` plus an index page for all 17 non-root source pages.

- [ ] **Step 5: Verify the generated route set and static state**

Compare all `src/app/**/page.tsx` routes with `out/**/index.html`; verify `out/static-cloud-state.json` exists and parses as JSON.

- [ ] **Step 6: Verify repository hygiene**

Run `git status --short --ignored` and a targeted secret-pattern scan. Expected: dependency/build/browser directories are ignored, no `.env` file is tracked, and no token or private key value is staged.

### Task 6: Commit, push, and verify both publication paths

**Files:**
- Commit: recovered source/configuration/docs/workflows only
- Never commit: ignored dependencies, build output, browser output, or secrets

**Interfaces:**
- Consumes: Clean verification evidence from Task 5.
- Produces: A pushed commit, successful GitHub Actions checks, a working Pages site, and a working Vercel production deployment.

- [ ] **Step 1: Review the exact commit scope**

Run `git diff --check`, `git diff --stat`, `git status --short`, and inspect every staged path before committing.

- [ ] **Step 2: Commit the recovery**

Stage only reviewed project files and commit with message `chore: restore development and deployment setup`.

- [ ] **Step 3: Push without force**

Push the current default branch using a normal non-force push. If the local history is behind or diverged, stop and reconcile through a new branch and pull request instead of rewriting remote history.

- [ ] **Step 4: Monitor GitHub Actions**

Use `gh run list` and `gh run watch` for the new commit. If a job fails, fetch its logs, fix locally, repeat Task 5, and push a follow-up commit.

- [ ] **Step 5: Verify GitHub Pages**

Request the configured Pages URL and confirm HTTP 200, RuleQuant title content, and successful loading of the dashboard and static state.

- [ ] **Step 6: Verify Vercel production**

Confirm the repository-connected Vercel deployment for the same commit is successful; request the production dashboard and a safe read-only API route, requiring HTTP 200 and expected RuleQuant content.
