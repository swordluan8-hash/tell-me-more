import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function rootDir() {
  return path.basename(process.cwd()) === "web" ||
    path.basename(process.cwd()) === "sanity"
    ? path.resolve(process.cwd(), "..")
    : process.cwd();
}

export function serverConfig() {
  const file = path.join(rootDir(), "sanity", ".env.local");
  const local: Record<string, string> = {};
  if (existsSync(file))
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) local[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  const get = (k: string) => process.env[k] || local[k] || "";
  const publicDemo = get("TMM_PUBLIC_DEMO") === "true";
  const publicRealHistory =
    publicDemo && get("TMM_PUBLIC_REAL_HISTORY") !== "false";
  return {
    projectId: get("SANITY_PROJECT_ID"),
    dataset: get("SANITY_DATASET") || "production",
    token: publicDemo ? "" : get("SANITY_AUTH_TOKEN"),
    contextUrl: get("SANITY_CONTEXT_MCP_URL"),
    organizationToken: get("SANITY_ORGANIZATION_TOKEN"),
    knowledgeBaseId: get("SANITY_KNOWLEDGE_BASE_ID"),
    storage: process.env.TMM_STORAGE || "sanity",
    privateDataset: get("TMM_PRIVATE_DATASET") === "true",
    publicDemo,
    publicRealHistory,
  };
}
