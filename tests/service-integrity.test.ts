import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { demoDocuments } from "../packages/domain/seed";
import { type ArchiveDocument, type HistoricalEvent } from "../packages/domain/model";
vi.mock("../packages/storage/repository", () => ({ repository: vi.fn(), storageMode: vi.fn(() => "local-demo") }));
vi.mock("../packages/storage/scenario", () => ({ readScenario: vi.fn(() => null) }));
vi.mock("../packages/storage/context", () => ({ retrieve: vi.fn() }));
import { repository } from "../packages/storage/repository";
import { retrieve } from "../packages/storage/context";
import { perform } from "../packages/application/service";
import { exampleDecision, hindsightExperimentDecision } from "../packages/domain/catalog";
let docs: ArchiveDocument[];
let appendCalls: number;
beforeEach(() => {
  docs = demoDocuments();
  appendCalls = 0;
  vi.mocked(repository).mockReturnValue({
    all: async () => structuredClone(docs),
    append: async (items: ArchiveDocument[]) => {
      appendCalls += 1;
      docs.push(...items);
    },
  });
  vi.mocked(retrieve).mockResolvedValue({
    events: docs.filter(
      (d): d is HistoricalEvent => d._type === "historicalEvent",
    ),
    mode: "context",
    notice: "test context",
  });
});
afterEach(() => vi.useRealTimers());
describe("production boundaries under test", () => {
  it("does not let client-supplied sourceKind promote recall to contemporary evidence", async () => {
    const source = docs.find((d) => d._type === "artifact")!;
    if (source._type !== "artifact") throw new Error("seed");
    source.kind = "memory_anchor";
    const event = docs.find((d):d is HistoricalEvent=>d._type === "historicalEvent")!;
    const result = (await perform("seal", {
      artifactId: source._id, sourceKind:"object_record", title:"合成测试", narration:"这是合成测试原话。",
      fields:event.fields, chosenAction:event.decisionNodes[0].chosenAction,
      historicalBest:event.decisionNodes[0].historicalBestDecisionStatement,
      eventDate:null, confirmed:true, artifactConfirmed:true, demo:true,
    })) as { documents: ArchiveDocument[] };
    const memory = result.documents.find((d)=>d._type === "memoryStatement");
    expect(memory?.sourceProvenance[0].strength).toBe("LATER_RECALL");
  });
  it("ordinary baseline ignores requested backdating and uses the real local registration date", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-22T23:30:00Z"));
    const result = (await perform("baseline", {
      choices:Array(10).fill(0), demo:true,
      asOfDate:"1999-01-01", recordedAt:"1999-01-01T00:00:00Z",
    })) as { documents: ArchiveDocument[] };
    const p = result.documents.find((d)=>d._type === "cognitionPlane");
    expect(p?.periodStart).toBe("2026-09-23");
    expect(p?.recordedAt).toBe("2026-09-22T23:30:00.000Z");
  });

  it("hindsight preview uses the same Context candidates and never persists", async () => {
    const before = docs.length;
    const result = (await perform("hindsight-preview", {
      current: hindsightExperimentDecision,
      demo: true,
    })) as {
      retrievalMode: string;
      temporalIntegrity: { eventRef: { _ref: string } }[];
      naiveFullHistory: {
        eventRef: { _ref: string };
        leakedMatched: string[];
      }[];
      rankingFlipped: boolean;
      events: HistoricalEvent[];
    };

    expect(result.retrievalMode).toBe("context");
    expect(result.events).toHaveLength(3);
    expect(result.temporalIntegrity[0].eventRef._ref).toBe("demo-event-2");
    expect(result.naiveFullHistory[0].eventRef._ref).toBe("demo-event-1");
    expect(result.rankingFlipped).toBe(true);
    expect(result.naiveFullHistory[0].leakedMatched).toEqual(
      expect.arrayContaining(["延期", "协调", "额外"]),
    );
    expect(docs.length).toBe(before);
    expect(appendCalls).toBe(0);
  });

  it("public preview returns a Context-backed result without persisting a session", async () => {
    const before = docs.length;
    const result = (await perform("empower-preview", {
      current: exampleDecision,
      demo: true,
    })) as {
      document: Extract<ArchiveDocument, { _type: "empowermentSession" }>;
      events: HistoricalEvent[];
      analysis: {
        algorithmVersion: string;
        principle: string;
        empowermentTargets: {
          cognition: { key: string; title: string; action: string }[];
          capability: { key: string; title: string; action: string }[];
        };
        decisionInfluence: {
          historyCards: unknown[];
          decisionActions: { key: string; title: string; action: string }[];
        };
        cognitionAndCapability: {
          dimensions: unknown[];
        };
      };
    };
    expect(result.document.retrievalMode).toBe("context");
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.analysis.algorithmVersion).toBe("empower-analysis-v1");
    expect(result.analysis.decisionInfluence.historyCards.length).toBeGreaterThan(0);
    expect(result.analysis.cognitionAndCapability.dimensions.length).toBeGreaterThan(0);
    expect(result.analysis.principle).toContain("不输出唯一最终选择");
    expect(docs.length).toBe(before);
    expect(appendCalls).toBe(0);
  });
});
