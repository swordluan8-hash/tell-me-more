import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { demoDocuments } from "../packages/domain/seed";
import {
  archiveDocument,
  answer,
  type HistoricalEvent,
} from "../packages/domain/model";
import { compare, currentFeatures, rank } from "../packages/domain/similarity";
import { exampleDecision, dimensions } from "../packages/domain/catalog";
import {
  missingFields,
  createEvent,
  createBaseline,
  classifyExplicitNarration,
} from "../packages/domain/workflow";
import {
  LocalRepository,
  rejectMutation,
} from "../packages/storage/repository";
import {
  candidateQuery,
  matchKnowledgeBaseEvents,
  parseKnowledgeBasePaths,
} from "../packages/storage/context";

const docs = demoDocuments();
const events = docs.filter(
  (d): d is HistoricalEvent => d._type === "historicalEvent",
);
const current = currentFeatures(exampleDecision, "current-test");
describe("product constitution", () => {
  it("all six document contracts are explicit; seed contains three sealed events and two planes", () => {
    docs.forEach((d) =>
      expect(archiveDocument.safeParse(d).success).toBe(true),
    );
    expect(events).toHaveLength(3);
    expect(docs.filter((d) => d._type === "cognitionPlane")).toHaveLength(2);
  });
  it("unknown states are complete answers and never forced into known evidence", () => {
    for (const state of [
      "unknown",
      "forgotten",
      "cannot_judge",
      "not_applicable",
    ] as const) {
      const a = { ...events[0].fields.event, state, text: state };
      expect(answer.safeParse(a).success).toBe(true);
      expect(missingFields({ event: a }).some((g) => g.key === "event")).toBe(
        false,
      );
    }
    expect(missingFields({ event: { state: "known", text: "" } })).toHaveLength(
      8,
    );
  });
  it("requires provenance on every derived cognitive field", () => {
    const e = structuredClone(events[0]);
    e.features.domain.provenance = [];
    expect(archiveDocument.safeParse(e).success).toBe(false);
    const p = structuredClone(docs.find((d) => d._type === "cognitionPlane")!);
    if (p._type === "cognitionPlane") p.fields.actionStyle.provenance = [];
    expect(archiveDocument.safeParse(p).success).toBe(false);
  });
  it("does not derive final advice: ranking is a closed evidence-only structure", () => {
    const matches = rank(current, events);
    expect(matches).toHaveLength(3);
    for (const m of matches) {
      expect(Object.keys(m).sort()).toEqual([
        "components",
        "coverage",
        "eventRef",
        "score",
      ]);
      expect(
        m.components.every((c) => c.eventRef._ref && c.provenance.length),
      ).toBe(true);
    }
    expect(JSON.stringify(matches)).not.toMatch(
      /你应该|唯一正确|一定会|建议选择/,
    );
  });
  it("outcome and later interpretations cannot affect similarity or candidate query", () => {
    const changed = structuredClone(events[0]);
    changed.fields.outcome.text = "未来大获成功";
    changed.fields.reflection.text = "你应该加入";
    changed.outcomeFacts[0].text = "彻底失败";
    changed.decisionNodes[0].longTermResult.text = "任何结果";
    expect(compare(current, changed)).toEqual(compare(current, events[0]));
    expect(candidateQuery(current)).not.toMatch(
      /outcome|result|evaluation|reflection|laterLearned/i,
    );
  });
  it("knowledge base retrieval uses explicit outline paths and exact historical identities", () => {
    const initial = [
      "# Knowledge bases",
      "Knowledge base id: \`kb-test\`",
      "partnership/choices [core]",
      "  summary",
      "information/gaps",
      "  summary",
      "Knowledge base id: \`kb-other\`",
      "other/path",
    ].join("\n");
    expect(parseKnowledgeBasePaths(initial, "kb-test")).toEqual([
      "partnership/choices",
      "information/gaps",
    ]);
    const matched = matchKnowledgeBaseEvents(
      `candidate demo-event-1 and ${events[2].title}`,
      events,
    );
    expect(matched.map((event) => event._id).sort()).toEqual(
      [events[0]._id, events[2]._id].sort(),
    );
  });

  it("knowledge base dataset source cannot ingest post-decision outcome or hindsight fields", () => {
    const source = readFileSync(
      new URL("../sanity/knowledge-base-source.groq", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/historicalBestDecisionStatement/);
    expect(source).not.toMatch(
      /outcome|reflection|evaluation|laterLearned|immediateResult|longTermResult|userEvaluationLater/i,
    );
  });

  it("weights sum to 100, unknowns lower coverage without renormalization", () => {
    expect(dimensions.reduce((s, d) => s + d.weight, 0)).toBe(100);
    const e = structuredClone(events[0]);
    const before = compare(current, e);
    e.features.domain.state = "unknown";
    const after = compare(current, e);
    expect(after.coverage).toBe(before.coverage - 20);
    expect(after.components[0].earned).toBe(0);
    expect(after.score).toBeLessThan(before.score);
  });
  it("does not invent role, relationship or technology from unlabelled narration", () => {
    expect(current.role.state).toBe("unknown");
    expect(current.social.state).toBe("unknown");
    expect(current.technology.state).toBe("unknown");
    expect(current.goal.text).toBe("收入与责任边界都很重要");
    expect(compare(current, events[0]).coverage).toBe(75);
  });
  it("AI inference is not evidence of historical cognition for matching", () => {
    const e = structuredClone(events[0]);
    e.features.role.provenance[0].strength = "AI_INFERENCE";
    expect(compare(current, e).components[1].comparable).toBe(false);
  });
  it("requires explicit confirmation and an artifact before sealing", () => {
    expect(() =>
      createEvent({ confirmed: false }, { event: "e", memory: "m" }),
    ).toThrow();
  });
  it("classifies only explicit user labels, preserving exact words and asking only remaining gaps", () => {
    const fields = classifyExplicitNarration(
      "发生了什么： 一次合作。\n当时知道什么：记不清\n其他自由叙述不被猜测。",
    );
    expect(fields.event?.text).toBe(" 一次合作。");
    expect(fields.knowledge?.state).toBe("forgotten");
    expect(missingFields(fields)).toHaveLength(6);
    expect(
      missingFields(fields).some(
        (g) => g.key === "event" || g.key === "knowledge",
      ),
    ).toBe(false);
  });
  it("baseline preserves the ten actual choices and never invents unasked dimensions", () => {
    const result = createBaseline(Array(10).fill(0), true, {
      baseline: "b",
      plane: "p",
    });
    const plane = result[1];
    if (plane._type === "cognitionPlane") {
      expect(plane.fields.moneyModel.state).toBe("unknown");
      expect(plane.fields.actionStyle.text).toBe("先行动，边做边判断");
    }
  });
  it("sealed documents reject replacement and retain identical originals", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tmm-test-"));
    const repo = new LocalRepository(path.join(dir, "archive.json"), []);
    await repo.append(docs);
    const before = await repo.all();
    const changed = structuredClone(events[0]);
    changed.title = "rewritten";
    await expect(repo.append([changed])).rejects.toThrow(
      "SEALED_HISTORY_IMMUTABLE",
    );
    expect(await repo.all()).toEqual(before);
    expect(() => rejectMutation()).toThrow("IMMUTABLE");
    expect("update" in repo).toBe(false);
    expect("delete" in repo).toBe(false);
  });
  it("concurrent append operations do not lose records", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tmm-test-"));
    const repo = new LocalRepository(path.join(dir, "archive.json"), []);
    await Promise.all(docs.slice(0, 3).map((d) => repo.append([d])));
    expect(await repo.all()).toHaveLength(3);
  });
});
