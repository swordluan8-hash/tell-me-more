import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { demoDocuments } from "../packages/domain/seed";
import type { ArchiveDocument } from "../packages/domain/model";
import { LocalRepository } from "../packages/storage/repository";

const dirs: string[] = [];
async function repo() {
  const dir = await mkdtemp(path.join(tmpdir(), "tmm-future-plane-"));
  dirs.push(dir);
  return new LocalRepository(path.join(dir, "archive.json"), []);
}
function futurePlane(id: string) {
  const source = demoDocuments().find(
    (d): d is Extract<ArchiveDocument, { _type: "cognitionPlane" }> =>
      d._type === "cognitionPlane",
  )!;
  const plane = structuredClone(source);
  plane._id = id;
  plane.anchorType = "future_observed";
  plane.periodStart = "2026-09-24";
  plane.periodEnd = "2026-09-24";
  plane.confirmation = undefined;
  return plane;
}
function confirmationMemory(id: string, text = "确认T+1") {
  const source = demoDocuments().find(
    (d): d is Extract<ArchiveDocument, { _type: "memoryStatement" }> =>
      d._type === "memoryStatement",
  )!;
  const memory = structuredClone(source);
  memory._id = id;
  memory.verbatim = text;
  memory.classifications = [
    { field: "TPLUS1.confirmation", quote: text, sourceField: "verbatim" },
  ];
  return memory;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("future cognition-plane confirmation gate", () => {
  it("rejects a future-observed plane without explicit confirmation evidence", async () => {
    const r = await repo();
    await expect(r.append([futurePlane("future-unconfirmed")])).rejects.toThrow(
      "FUTURE_PLANE_CONFIRMATION_REQUIRED",
    );
  });

  it("accepts a future-observed plane only when confirmation points to stored verbatim evidence", async () => {
    const r = await repo();
    const memory = confirmationMemory("future-confirmation");
    const plane = futurePlane("future-confirmed");
    plane.confirmation = {
      confirmedAt: "2026-09-24T00:24:20.000Z",
      verbatim: "确认T+1",
      sourceRef: { _type: "reference", _ref: memory._id },
    };
    await expect(r.append([memory, plane])).resolves.toBeUndefined();
    const docs = await r.all();
    expect(docs.map((d) => d._id)).toEqual(
      expect.arrayContaining([memory._id, plane._id]),
    );
  });

  it("rejects a confirmation reference whose stored verbatim does not contain the claimed confirmation", async () => {
    const r = await repo();
    const memory = confirmationMemory("wrong-confirmation", "别的内容");
    const plane = futurePlane("future-bad-evidence");
    plane.confirmation = {
      confirmedAt: "2026-09-24T00:24:20.000Z",
      verbatim: "确认T+1",
      sourceRef: { _type: "reference", _ref: memory._id },
    };
    await expect(r.append([memory, plane])).rejects.toThrow(
      "FUTURE_PLANE_CONFIRMATION_EVIDENCE_REQUIRED",
    );
  });
});
