import { z } from "zod";
import { randomUUID } from "node:crypto";
import { gapFieldKeys, gapCatalog } from "./gap-catalog";
import { archiveDocument, answer, evidence, ref, type ArchiveDocument } from "./model";
import type { ScenarioContext } from "./temporal";

export const supplementInput = z.object({
  eventId:z.string().min(1), decisionId:z.string().min(1),
  verbatim:z.string().min(1).max(30000).refine((s) => s.trim().length > 0),
  updates:z.array(z.object({field:z.enum(gapFieldKeys), state:answer.shape.state, quote:z.string().min(1).max(20000)})).min(1).max(15),
  sourceMemoryId:z.string().min(1).optional(),
  confirmed:z.literal(true), demo:z.boolean(),
  requestId:z.string().uuid().optional(),
}).strict().superRefine((v,c) => {
  if (new Set(v.updates.map((u) => u.field)).size !== v.updates.length) c.addIssue({code:"custom",message:"同一请求不能重复归类同一字段"});
  for (const u of v.updates) {
    if (!u.quote.trim() || !v.verbatim.includes(u.quote)) c.addIssue({code:"custom",message:"分类必须指向完整原话中的精确摘录"});
    if (u.state === "known" && /^(不知道|记不清|无法判断|当时没有这项)[。！!\s]*$/.test(u.quote)) c.addIssue({code:"custom",message:"明确未知不能标记为已知事实"});
  }
});
export function buildSupplement(payload: unknown, docs: ArchiveDocument[], scenario: ScenarioContext | null = null) {
  const v = supplementInput.parse(payload);
  const event = docs.find((d) => d._id === v.eventId && d._type === "historicalEvent" && d.demo === v.demo);
  if (!event || event._type !== "historicalEvent") throw new Error("EVENT_NOT_FOUND");
  if (!event.decisionNodes.some((n) => n.decisionId === v.decisionId)) throw new Error("DECISION_NODE_NOT_FOUND");
  const source = v.sourceMemoryId ? docs.find((d) => d._id === v.sourceMemoryId && d._type === "memoryStatement" && d.demo === v.demo) : null;
  if (v.sourceMemoryId && (!source || source._type !== "memoryStatement" || !source.verbatim.includes(v.verbatim) ||
    !source.eventRefs.some((r) => r._ref === event._id))) throw new Error("SOURCE_QUOTE_OR_EVENT_LINK_INVALID");
  const duplicateContent = docs.some((d) =>
    d._type === "memoryStatement" &&
    d.demo === v.demo &&
    d.supplements?.some((s) =>
      s.eventRef._ref === event._id &&
      s.decisionId === v.decisionId &&
      v.updates.some(
        (u) =>
          u.field === s.field &&
          u.state === s.answer.state &&
          u.quote === s.answer.text,
      ),
    ),
  );
  if (duplicateContent) throw new Error("DUPLICATE_SUPPLEMENT_CONTENT");
  const now = new Date().toISOString();
  const id = `supplement-${v.requestId || randomUUID()}`;
  if (docs.some((d) => d._id === id)) throw new Error("DUPLICATE_SUPPLEMENT_REQUEST");
  const sourceId = source?._id || id;
  const document = archiveDocument.parse({
    _id:id, _type:"memoryStatement", userId:"single-user", demo:v.demo, status:"sealed", recordedAt:now, sealedAt:now,
    verbatim:v.verbatim, artifactRefs:source?._type === "memoryStatement" ? source.artifactRefs : [], eventRefs:[ref(event._id)],
    collectionContext:scenario ? {scenarioId:scenario.id, viewpointDate:scenario.asOfDate} : undefined,
    classifications:v.updates.map((u) => ({field:`${event._id}.${v.decisionId}.${u.field}`,quote:u.quote,sourceField:"verbatim"})),
    supplements:v.updates.map((u) => ({eventRef:ref(event._id),decisionId:v.decisionId,field:u.field,
      answer:{state:u.state,text:u.quote,provenance:[evidence(sourceId,"verbatim",u.quote,"LATER_RECALL",now)]}})),
    sourceProvenance:[evidence(sourceId,"verbatim",v.verbatim,"LATER_RECALL",now)],
  });
  return { document, savedFields:v.updates.map((u) => gapCatalog[u.field].label) };
}
