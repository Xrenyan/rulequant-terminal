import type { RuleQuantCloudState } from "@/lib/cloud/cloud-state";
import { EMPTY_CLOUD_STATE, mergeManualCloudDraws, summarizeDraws } from "@/lib/cloud/cloud-state";

const DEFAULT_STATE_PATH = ".rulequant/cloud-state.json";

type GitHubContentResponse = {
  content?: string;
  sha?: string;
};

function githubToken() {
  return process.env.RULEQUANT_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
}

function githubRepo() {
  return process.env.RULEQUANT_GITHUB_REPO || "";
}

function githubBranch() {
  return process.env.RULEQUANT_GITHUB_BRANCH || "main";
}

function statePath() {
  return process.env.RULEQUANT_GITHUB_STATE_PATH || DEFAULT_STATE_PATH;
}

export function isGitHubStateConfigured() {
  return Boolean(githubToken() && githubRepo());
}

function contentUrl() {
  const repo = githubRepo();
  const path = statePath().split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${repo}/contents/${path}`;
}

function headers() {
  return {
    Authorization: `Bearer ${githubToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "RuleQuant/1.0",
  };
}

function encodeBase64(input: string) {
  return Buffer.from(input, "utf8").toString("base64");
}

function decodeBase64(input: string) {
  return Buffer.from(input.replace(/\n/g, ""), "base64").toString("utf8");
}

async function fetchStateFile(): Promise<{ state?: RuleQuantCloudState; sha?: string; error?: string }> {
  const response = await fetch(`${contentUrl()}?ref=${encodeURIComponent(githubBranch())}`, {
    cache: "no-store",
    headers: headers(),
  });
  if (response.status === 404) return {};
  if (!response.ok) return { error: `GitHub state read failed: HTTP ${response.status}` };
  const data = (await response.json()) as GitHubContentResponse;
  if (!data.content) return {};
  return {
    state: JSON.parse(decodeBase64(data.content)) as RuleQuantCloudState,
    sha: data.sha,
  };
}

export async function loadGitHubState(): Promise<RuleQuantCloudState> {
  if (!isGitHubStateConfigured()) {
    return {
      ...EMPTY_CLOUD_STATE,
      meta: { enabled: false, source: "disabled", message: "GitHub state is not configured" },
    };
  }
  const result = await fetchStateFile();
  if (result.error) {
    return {
      ...EMPTY_CLOUD_STATE,
      meta: { enabled: false, source: "disabled", message: result.error },
    };
  }
  if (!result.state) {
    return {
      ...EMPTY_CLOUD_STATE,
      meta: { enabled: true, source: "github", message: "GitHub state file is empty" },
    };
  }
  const summary = summarizeDraws(result.state.draws ?? []);
  return {
    draws: summary.sorted,
    rules: result.state.rules ?? [],
    samples: result.state.samples ?? [],
    config: result.state.config,
    logs: result.state.logs ?? [],
    backups: result.state.backups ?? [],
    referenceHistory: result.state.referenceHistory ?? [],
    meta: {
      enabled: true,
      source: "github",
      updatedAt: result.state.meta?.updatedAt,
      latestIssue: summary.latestIssue,
      recordCount: summary.recordCount,
      message: result.state.meta?.message,
    },
  };
}

export async function saveGitHubStatePatch(patch: Partial<Omit<RuleQuantCloudState, "meta">>) {
  if (!isGitHubStateConfigured()) return loadGitHubState();
  const currentFile = await fetchStateFile();
  const current = currentFile.state ?? EMPTY_CLOUD_STATE;
  const draws = patch.draws
    ? mergeManualCloudDraws({
        incomingDraws: patch.draws,
        currentDraws: current.draws ?? [],
        logs: patch.logs ?? current.logs ?? [],
      })
    : current.draws ?? [];
  const summary = summarizeDraws(draws);
  const nextState: RuleQuantCloudState = {
    draws,
    rules: patch.rules ?? current.rules ?? [],
    samples: patch.samples ?? current.samples ?? [],
    config: patch.config ?? current.config,
    logs: patch.logs ?? current.logs ?? [],
    backups: patch.backups ?? current.backups ?? [],
    referenceHistory: patch.referenceHistory ?? current.referenceHistory ?? [],
    meta: {
      enabled: true,
      source: "github",
      updatedAt: new Date().toISOString(),
      latestIssue: summary.latestIssue,
      recordCount: summary.recordCount,
    },
  };

  const response = await fetch(contentUrl(), {
    method: "PUT",
    headers: {
      ...headers(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `Update RuleQuant cloud state ${new Date().toISOString()}`,
      content: encodeBase64(`${JSON.stringify(nextState, null, 2)}\n`),
      sha: currentFile.sha,
      branch: githubBranch(),
    }),
  });
  if (!response.ok) {
    throw new Error(`GitHub state write failed: HTTP ${response.status}`);
  }
  return nextState;
}
