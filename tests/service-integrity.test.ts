import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { demoDocuments } from "../packages/domain/seed";
import { type ArchiveDocument, type HistoricalEvent } from "../packages/domain/model";
vi.mock("../packages/storage/repository", () => ({ repository: vi.fn(), storageMode: vi.fn(() => "local-demo") }));
vi.mock("../packages/storage/scenario", () => ({ readScenario: vi.fn(() => null) }));
import { repository } from "../packages/storage/repository";
import { perform } from "../packages/application/service";
let docs: ArchiveDocument[];
beforeEach(() => {
  docs = demoDocuments();
  vi.mocked(repository).mockReturnValue({ all: async () => structuredClone(docs), append: async (items) => { docs.push(...items); } });
});
afterEach(() => vi.useRealTimers());
describe("production boundaries under test", () => {
  it("does not let client-supplied sourceKind promote recall to contemporary evidence", async () => {
    const source = docs.find((d) => d._type === "artifact")!;
    if (source._type !== "artifact") throw new Error("seed");
    source.kind = "memory_anchor";
    const event = docs.find((d):d is HistoricalEvent=>d._type === "historicalEvent")!;
    const result = await perform("seal", {
      artifactId: source._id, sourceKind:"object_record", title:"合成测试", narration:"这是合成测试原话。",
      fields:event.fields, chosenAction:event.decisionNodes[0].chosenAction,
      historicalBest:event.decisionNodes[0].historicalBestDecisionStatement,
      eventDate:null, confirmed:true, artifactConfirmed:true, demo:true,
    });
    const memory = result.documents?.find((d)=>d._type === "memoryStatement");
    expect(memory?.sourceProvenance[0].strength).toBe("LATER_RECALL");
  });
  it("ordinary baseline ignores requested backdating and uses the real local registration date", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-22T23:30:00Z"));
    const result = await perform("baseline", { choices:Array(10).fill(0), demo:true, asOfDate:"1999-01-01", recordedAt:"1999-01-01T00:00:00Z" });
    const p = result.documents?.find((d)=>d._type === "cognitionPlane");
    expect(p?.periodStart).toBe("2026-09-23");
    expect(p?.recordedAt).toBe("2026-09-22T23:30:00.000Z");
  });
});
