import fs from "node:fs";
import path from "node:path";

const endpoint = process.env.RULEQUANT_CLOUD_STATE_URL || "https://rulequant-terminal.vercel.app/api/cloud/state";
const root = process.cwd();

async function main() {
  const response = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh static data: ${response.status} ${response.statusText}`);
  }

  const state = await response.json();
  if (!Array.isArray(state.draws) || !Array.isArray(state.rules)) {
    throw new Error("Cloud state response does not include draws/rules arrays.");
  }

  fs.writeFileSync(path.join(root, "data", "sample-draws.json"), `${JSON.stringify(state.draws, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(root, "data", "sample-rules.json"), `${JSON.stringify(state.rules, null, 2)}\n`, "utf8");
  fs.mkdirSync(path.join(root, "public"), { recursive: true });
  fs.writeFileSync(path.join(root, "public", "static-cloud-state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        latestIssue: state.meta?.latestIssue,
        draws: state.draws.length,
        rules: state.rules.length,
        updatedAt: state.meta?.updatedAt,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
