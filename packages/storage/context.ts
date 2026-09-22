import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  historicalEvent,
  type Features,
  type HistoricalEvent,
} from "../domain/model";
import { serverConfig } from "./config";
import { repository, storageMode } from "./repository";
import { tokens } from "../domain/similarity";

type ToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: unknown;
};

export function candidateQuery(features: Features) {
  const words = [
    ...new Set(
      Object.values(features)
        .filter((v) => v.state === "known")
        .flatMap((v) => tokens(v.text)),
    ),
  ].slice(0, 60);
  const clauses = Object.keys(features).map(
    (k) => `features.${k}.text match ${JSON.stringify(words)}`,
  );
  return `*[_type == "historicalEvent" && userId == "single-user" && status == "sealed" && (${clauses.join(" || ")})][0...50]{_id}`;
}

export function parseKnowledgeBasePaths(
  initialContext: string,
  knowledgeBaseId: string,
) {
  const marker = `Knowledge base id: \`${knowledgeBaseId}\``;
  const start = initialContext.indexOf(marker);
  if (start < 0) return [];
  const tail = initialContext.slice(start + marker.length);
  const nextBase = tail.indexOf("\nKnowledge base id:");
  const section = nextBase >= 0 ? tail.slice(0, nextBase) : tail;
  return [
    ...new Set(
      section
        .split("\n")
        .map((line) => line.trim())
        .filter((line) =>
          /^[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_/-]*(?: \[[^\]]+\])?$/i.test(
            line,
          ),
        )
        .map((line) => line.replace(/ \[[^\]]+\]$/, "")),
    ),
  ].slice(0, 20);
}

export function matchKnowledgeBaseEvents(
  knowledgeText: string,
  events: HistoricalEvent[],
) {
  const titleCounts = new Map<string, number>();
  for (const event of events)
    titleCounts.set(event.title, (titleCounts.get(event.title) || 0) + 1);
  return events.filter(
    (event) =>
      knowledgeText.includes(event._id) ||
      (event.title.length > 0 &&
        titleCounts.get(event.title) === 1 &&
        knowledgeText.includes(event.title)),
  );
}

function toolText(result: ToolResult) {
  if (result.structuredContent !== undefined)
    return JSON.stringify(result.structuredContent);
  if (!Array.isArray(result.content)) return "";
  return result.content
    .map((block) => {
      if (
        typeof block !== "object" ||
        block === null ||
        !("type" in block) ||
        (block as { type?: unknown }).type !== "text" ||
        !("text" in block)
      )
        return "";
      const text = (block as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("\n");
}

export async function retrieve(
  features: Features,
  personal = false,
): Promise<{
  events: HistoricalEvent[];
  mode: "context" | "sanity-groq" | "local-demo";
  notice: string;
}> {
  const c = serverConfig();
  const all = await repository(personal).all();
  const events = all.filter(
    (d): d is HistoricalEvent =>
      d._type === "historicalEvent" && d.demo !== personal,
  );
  const mode = storageMode(personal);
  if (mode === "local-demo")
    return { events, mode, notice: "本地持久化档案；未使用 Sanity Context。" };

  const contextToken = c.contextUrl?.includes("/context/organizations/")
    ? c.organizationToken
    : c.token;
  if (!c.contextUrl || !contextToken)
    return {
      events,
      mode,
      notice:
        "从 Sanity Content Lake 实时读取。Context 未授权；当前为 GROQ 回退，不是 Context 验收成功。",
    };

  const client = new Client({
    name: "tell-me-more-retrieval",
    version: "0.1.0",
  });

  try {
    const url = new URL(c.contextUrl);
    const organizationEndpoint =
      url.pathname.startsWith("/v1/context/organizations/");
    const projectDatasetEndpoint =
      /^\/v\d{4}-\d{2}-\d{2}\/context\/mcp\/[^/]+\/[^/]+\/?$/.test(
        url.pathname,
      );
    if (
      url.origin !== "https://api.sanity.io" ||
      (!organizationEndpoint && !projectDatasetEndpoint)
    )
      throw new Error("INVALID_CONTEXT_ENDPOINT");

    await client.connect(
      new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers: { Authorization: `Bearer ${contextToken}` },
        },
      }),
    );

    const listed = await client.listTools();
    const toolNames = new Set(listed.tools.map((tool) => tool.name));

    if (toolNames.has("knowledge_base_read")) {
      if (!c.knowledgeBaseId) throw new Error("KNOWLEDGE_BASE_ID_REQUIRED");
      if (!toolNames.has("initial_context"))
        throw new Error("KNOWLEDGE_BASE_INITIAL_CONTEXT_REQUIRED");

      const initial = (await client.callTool({
        name: "initial_context",
        arguments: {},
      })) as ToolResult;
      if (initial.isError) throw new Error("KNOWLEDGE_BASE_CONTEXT_FAILED");

      const paths = parseKnowledgeBasePaths(
        toolText(initial),
        c.knowledgeBaseId,
      );
      if (paths.length === 0) throw new Error("KNOWLEDGE_BASE_OUTLINE_EMPTY");

      const read = (await client.callTool({
        name: "knowledge_base_read",
        arguments: {
          knowledgeBase: c.knowledgeBaseId,
          paths,
        },
      })) as ToolResult;
      if (read.isError) throw new Error("KNOWLEDGE_BASE_READ_FAILED");

      const candidates = matchKnowledgeBaseEvents(toolText(read), events);
      if (candidates.length === 0)
        throw new Error("KNOWLEDGE_BASE_NO_EVENT_IDENTITIES");

      return {
        events: candidates.map((event) => historicalEvent.parse(event)),
        mode: "context",
        notice:
          "Sanity Knowledge Base Context MCP 召回历史候选；Content Lake 回读完整封存原档后，仅按决策前维度透明重排。",
      };
    }

    if (!toolNames.has("groq_query"))
      throw new Error("CONTEXT_RETRIEVAL_TOOL_REQUIRED");

    const result = (await client.callTool({
      name: "groq_query",
      arguments: { query: candidateQuery(features) },
    })) as ToolResult;
    if (result.isError) throw new Error("CONTEXT_QUERY_FAILED");

    let payload: unknown = result.structuredContent;
    if (!payload) payload = JSON.parse(toolText(result));
    const parsed = payload as {
      result?: { _id: string }[];
      meta?: { warnings?: unknown };
    };
    if (!Array.isArray(parsed.result) || parsed.meta?.warnings)
      throw new Error("CONTEXT_INCOMPLETE_RESULT");

    const ids = new Set(parsed.result.map((row) => row._id));
    return {
      events: events
        .filter((event) => ids.has(event._id))
        .map((event) => historicalEvent.parse(event)),
      mode: "context",
      notice:
        "Sanity Context MCP 召回候选 ID；Content Lake 回读完整原档后透明重排。",
    };
  } catch {
    return {
      events,
      mode: "sanity-groq",
      notice:
        "Context 或 Knowledge Base 连接/召回未通过；已明确回退到 Sanity Content Lake。请运行 npm run verify:sanity 检查配置。",
    };
  } finally {
    await client.close().catch(() => {});
  }
}
