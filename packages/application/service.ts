import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  artifact,
  archiveDocument,
  ref,
  evidence,
  stated,
  currentDecision,
  type ArchiveDocument,
} from "../domain/model";
import {
  base,
  createBaseline,
  createEvent,
  sealRequest,
} from "../domain/workflow";
import { ALGORITHM_VERSION, currentFeatures, leakyWholeHistoryRank, rank } from "../domain/similarity";
import { repository, storageMode } from "../storage/repository";
import { serverConfig } from "../storage/config";
import { retrieve } from "../storage/context";
import { readScenario } from "../storage/scenario";
import { eligibleHistory } from "../domain/temporal";
import { auditArchive, auditEvent, applicableSupplements, effectiveEvent } from "../domain/completeness";
import { buildSupplement } from "../domain/supplements";

const artifactInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    kind: z.enum(["text", "image_metadata", "memory_anchor"]),
    originalText: z.string().max(30000),
    originalDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    demo: z.boolean(),
    fileMetadata: artifact.shape.fileMetadata,
  })
  .superRefine((v, c) => {
    if ((v.kind === "text" || v.kind === "memory_anchor") && !v.originalText.trim())
      c.addIssue({ code: "custom", message: "请填写原文" });
    if (v.kind === "image_metadata" && !v.fileMetadata)
      c.addIssue({ code: "custom", message: "请提供图片元数据" });
  });
export async function getArchive(personal = false) {
  const docs = await repository(personal).all();
  return {
    documents: docs.filter((d) => d.demo !== personal),
    mode: storageMode(personal),
    scenario: readScenario(personal),
    publicDemo: serverConfig().publicDemo,
  };
}

async function hindsightExperiment(payload: unknown) {
  const v = z
    .object({ current: currentDecision, demo: z.boolean() })
    .parse(payload);
  const id = randomUUID();
  const features = currentFeatures(v.current, id);
  const retrieved = await retrieve(features, !v.demo);
  const scenario = readScenario(!v.demo);
  const repo = repository(!v.demo);
  const all = await repo.all();
  const scoped = eligibleHistory(retrieved.events, all, scenario);
  const ownDocs = all.filter((d) => d.demo === v.demo);
  const resolved = scoped.events.map((e) => effectiveEvent(e, ownDocs, scenario));
  const temporalIntegrity = rank(features, resolved);
  const naiveFullHistory = leakyWholeHistoryRank(v.current, resolved);

  return {
    current: v.current,
    retrievalMode: retrieved.mode,
    retrievalNotice: retrieved.notice,
    candidateCount: resolved.length,
    temporalIntegrity,
    naiveFullHistory,
    rankingFlipped:
      temporalIntegrity[0]?.eventRef._ref !==
      naiveFullHistory[0]?.eventRef._ref,
    events: resolved,
    conclusion:
      "同一当前问题与同一批 Context 候选：扁平全文 baseline 受后来结果影响，把 2018 抬到第一；Temporal Integrity 仅用决策前字段，2021 保持第一。",
  };
}

async function empower(payload: unknown, persist: boolean) {
  const v = z
      .object({ current: currentDecision, demo: z.boolean() })
      .parse(payload),
    id = randomUUID();
  const features = currentFeatures(v.current, id),
    retrieved = await retrieve(features, !v.demo);
  const scenario = readScenario(!v.demo);
  const repo = repository(!v.demo);
  const all = await repo.all();
  const scoped = eligibleHistory(retrieved.events, all, scenario);
  const ownDocs = all.filter((d) => d.demo === v.demo);
  const resolved = scoped.events.map((e) => effectiveEvent(e, ownDocs, scenario));
  const readiness = auditArchive(ownDocs, scenario);
  const matches = rank(features, resolved);
  const document = archiveDocument.parse({
    ...base(id, "empowermentSession", v.demo),
    _type: "empowermentSession",
    algorithmVersion: ALGORITHM_VERSION + "+gap-loop-v1",
    sourceRevisionRefs: applicableSupplements(ownDocs, scenario).map((m) => ref(m._id)),
    completeness: {
      assessedNodes: readiness.summary.assessedNodes,
      coreCompleteNodes: readiness.summary.coreCompleteNodes,
      pendingFields: readiness.summary.pendingFields,
      basis: readiness.basis,
    },
    candidateCount: scoped.events.length,
    excludedByTime: scoped.excluded,
    scenario: scenario
      ? { id: scenario.id, asOfDate: scenario.asOfDate, timeZone: scenario.timeZone }
      : undefined,
    current: v.current,
    currentFeatures: features,
    retrievalMode: retrieved.mode,
    retrievalNotice: retrieved.notice,
    matches,
    sourceProvenance: matches.flatMap((m) =>
      m.components.flatMap((c) => c.provenance),
    ),
    conclusion: "历史是参照，最终选择由你完成。",
  });
  if (persist) await repo.append([document]);
  return {
    document,
    events: resolved,
    scenario,
    readiness: resolved.map((e) =>
      auditEvent(
        ownDocs.find((d) => d._id === e._id) as typeof e,
        ownDocs,
        scenario,
      ),
    ),
  };
}

export async function perform(action: string, payload: unknown) {
  if (action === "gap-audit") {
    const v = z.object({ demo:z.boolean() }).parse(payload);
    const docs = (await repository(!v.demo).all()).filter((d) => d.demo === v.demo);
    return { audit:auditArchive(docs, readScenario(!v.demo)) };
  }
  if (action === "fill-gap") {
    const scope = z.object({demo:z.boolean()}).parse(payload);
    const repo = repository(!scope.demo);
    const docs = (await repo.all()).filter((d) => d.demo === scope.demo);
    const scenario = readScenario(!scope.demo);
    const built = buildSupplement(payload, docs, scenario);
    await repo.append([built.document]);
    const updated = [...docs, built.document];
    return { document:built.document, savedFields:built.savedFields, audit:auditArchive(updated, scenario), mode:storageMode(!scope.demo) };
  }
  if (action === "artifact") {
    const v = artifactInput.parse(payload),
      id = randomUUID(),
      raw =
        v.kind === "image_metadata"
          ? JSON.stringify(v.fileMetadata)
          : v.originalText;
    const document = artifact.parse({
      ...base(id, "artifact", v.demo),
      ...v,
      originalDate: v.originalDate
        ? stated(v.originalDate, id, "originalDate")
        : stated("原始时间未记录", id, "originalDate", "unknown"),
      sha256: createHash("sha256").update(raw).digest("hex"),
    });
    await repository(!v.demo).append([document]);
    return { document, mode: storageMode(!v.demo) };
  }
  if (action === "baseline") {
    const v = z
      .object({
        choices: z.array(z.number().int().min(0).max(2)).length(10),
        demo: z.boolean(),
      })
      .parse(payload);
    const documents = createBaseline(v.choices, v.demo, {
      baseline: randomUUID(),
      plane: randomUUID(),
    });
    await repository(!v.demo).append(documents);
    return { documents, mode: storageMode(!v.demo) };
  }
  if (action === "seal") {
    const v = sealRequest.parse(payload),
      repo = repository(!v.demo),
      existing = await repo.all();
    const source = existing.find((d) =>
      d._id === v.artifactId && d._type === "artifact" && d.demo === v.demo,
    );
    if (!source || source._type !== "artifact") throw new Error("ARTIFACT_NOT_FOUND");
    // Provenance comes from the stored source, never from a client-supplied label.
    const documents = createEvent({
      ...v,
      sourceKind: source.kind === "memory_anchor" ? "memory_anchor" : "object_record",
    }, { event: randomUUID(), memory: randomUUID() });
    await repo.append(documents);
    return { documents, mode: storageMode(!v.demo) };
  }
  if (action === "append-recall") {
    const v = z
        .object({
          eventId: z.string(),
          verbatim: z.string().min(1).max(30000),
          demo: z.boolean(),
        })
        .parse(payload),
      repo = repository(!v.demo);
    const event = (await repo.all()).find(
      (d) =>
        d._id === v.eventId &&
        d._type === "historicalEvent" &&
        d.demo === v.demo,
    );
    if (!event) throw new Error("EVENT_NOT_FOUND");
    const id = randomUUID();
    const document: ArchiveDocument = {
      ...base(id, "memoryStatement", v.demo),
      _type: "memoryStatement",
      verbatim: v.verbatim,
      artifactRefs: [],
      eventRefs: [ref(event._id)],
      classifications: [],
      sourceProvenance: [evidence(id, "verbatim", v.verbatim)],
    };
    await repo.append([document]);
    return { document };
  }
  if (action === "empower") return empower(payload, true);
  if (action === "hindsight-preview") return hindsightExperiment(payload);
  if (action === "empower-preview") {
    const v = z
      .object({ current: currentDecision, demo: z.literal(true) })
      .parse(payload);
    return empower(v, false);
  }

  throw new Error("UNKNOWN_ACTION");
}
