import type { Answer, ArchiveDocument, HistoricalEvent } from "./model";
import { gapCatalog, gapFieldKeys, questionOrder, type GapField } from "./gap-catalog";
import { localDate, timelineSections, type Plane, type ScenarioContext } from "./temporal";
import { dimensions, planeFields } from "./catalog";

type Memory = Extract<ArchiveDocument, { _type: "memoryStatement" }>;
export type FieldStatus = "recorded" | "explicit_unknown" | "pending";
export type FieldAudit = { key: GapField; label: string; required: boolean; status: FieldStatus; answer: Answer | null; records: Answer[]; question: string | null };

// Legacy imports used unknown + an empty AI provenance as a placeholder.
// That is NOT a user's explicit "I don't know" and must not satisfy completeness.
export function recordStatus(a: Answer | undefined | null): FieldStatus {
  if (!a || !a.text.trim() || !a.provenance.length || a.provenance.some((p) => p.strength === "AI_INFERENCE" || !p.quote.trim())) return "pending";
  return a.state === "known" ? "recorded" : "explicit_unknown";
}
function available(m: Memory, scenario: ScenarioContext | null): boolean {
  if (!scenario) return true;
  if (m.collectionContext) return m.collectionContext.scenarioId === scenario.id && m.collectionContext.viewpointDate <= scenario.asOfDate;
  return scenario.recordIds.includes(m._id) || localDate(m.recordedAt, scenario.timeZone) <= scenario.asOfDate;
}
export function applicableSupplements(docs: ArchiveDocument[], scenario: ScenarioContext | null = null): Memory[] {
  return docs.filter((d): d is Memory => d._type === "memoryStatement" && !!d.supplements?.length && available(d, scenario));
}
function firstPresent(...values: (Answer | null | undefined)[]): Answer | null {
  return values.find((a) => recordStatus(a) !== "pending") || values.find(Boolean) || null;
}
function baseField(event: HistoricalEvent, index: number, field: GapField): Answer | null {
  const n = event.decisionNodes[index];
  const shared = index === 0 ? event.fields : null;
  switch (field) {
    case "event": return firstPresent(shared?.event, n.trigger);
    case "role": return firstPresent(shared?.role, event.userRoleAndPosition);
    case "knowledge": return firstPresent(shared?.knowledge, n.informationAvailable);
    case "options": return firstPresent(shared?.options, n.optionsVisible);
    case "reason": return firstPresent(shared?.reason, n.reasonInUserWords);
    case "outcome": return firstPresent(shared?.outcome, n.immediateResult);
    case "reflection": return firstPresent(shared?.reflection);
    case "evaluation": return firstPresent(shared?.evaluation, n.userEvaluationLater);
    case "chosenAction": return n.chosenAction;
    case "historicalBest": return n.historicalBestDecisionStatement;
    case "goal": return n.goal;
    case "constraints": return n.constraints;
    case "resources": return n.resources;
    case "social": return firstPresent(event.socialEnvironment, event.features.social);
    case "technology": return firstPresent(event.technologyLimitations[0], event.features.technology);
  }
}
function combine(values: Answer[]): Answer | null {
  const supported = values.filter((a) => recordStatus(a) !== "pending");
  const known = supported.filter((a) => a.state === "known");
  if (!known.length) return supported.at(-1) || values[0] || null;
  // This is a read-only union of quoted statements, NOT a replacement of history.
  // Different statements remain separately accessible in FieldAudit.records.
  return { state: "known", text: [...new Set(known.map((a) => a.text))].join("\n"), provenance: known.flatMap((a) => a.provenance) };
}
export function auditEvent(event: HistoricalEvent, docs: ArchiveDocument[], scenario: ScenarioContext | null = null) {
  const additions = applicableSupplements(docs, scenario).filter((m) => m.demo === event.demo);
  const nodes = event.decisionNodes.map((n, index) => {
    const fields: FieldAudit[] = gapFieldKeys.map((key) => {
      const original = baseField(event, index, key);
      const extra = additions.flatMap((m) => (m.supplements || []).filter((s) => s.eventRef._ref === event._id && s.decisionId === n.decisionId && s.field === key).map((s) => s.answer));
      const records = [...(original ? [original] : []), ...extra];
      const answer = combine(records), status = recordStatus(answer);
      return { key, label: gapCatalog[key].label, required: gapCatalog[key].required, answer, status, records,
        question: status === "pending" ? gapCatalog[key].question : null };
    });
    const core = fields.filter((f) => f.required);
    const pending = fields.filter((f) => f.status === "pending");
    const candidates = questionOrder.map((key) => fields.find((f) => f.key === key)!).filter((f) => f.status === "pending");
    return { decisionId: n.decisionId, index, fields, coreTotal: core.length,
      coreRecorded: core.filter((f) => f.status !== "pending").length,
      coreComplete: core.every((f) => f.status !== "pending"),
      evidenceFields: fields.filter((f) => f.status === "recorded").length,
      explicitUnknownFields: fields.filter((f) => f.status === "explicit_unknown").length,
      pending: pending.map((f) => f.key), nextQuestion: candidates[0] || null };
  });
  return { eventId: event._id, title: event.title, date: event.eventStartDate, datePrecision: event.datePrecision,
    coreComplete: nodes.every((n) => n.coreComplete), nodes };
}
export type EventAudit = ReturnType<typeof auditEvent>;

export function effectiveEvent(event: HistoricalEvent, docs: ArchiveDocument[], scenario: ScenarioContext | null = null): HistoricalEvent {
  const out = structuredClone(event), audit = auditEvent(event, docs, scenario);
  for (const nodeAudit of audit.nodes) {
    const n = out.decisionNodes[nodeAudit.index];
    const a = (k: GapField) => nodeAudit.fields.find((f) => f.key === k)?.answer;
    if (nodeAudit.index === 0) {
      for (const key of Object.keys(out.fields) as (keyof typeof out.fields)[]) if (a(key)) out.fields[key] = a(key)!;
    }
    const mapping = { event:"trigger", knowledge:"informationAvailable", options:"optionsVisible", reason:"reasonInUserWords", outcome:"immediateResult", evaluation:"userEvaluationLater", chosenAction:"chosenAction", historicalBest:"historicalBestDecisionStatement", goal:"goal", constraints:"constraints", resources:"resources" } as const;
    for (const [field, property] of Object.entries(mapping)) {
      const value = a(field as GapField); if (value) n[property as typeof mapping[keyof typeof mapping]] = value;
    }
  }
  const fields = audit.nodes[0]?.fields;
  if (fields) {
    const get = (k: GapField) => fields.find((f) => f.key === k)?.answer;
    const map = { event:"domain", role:"role", knowledge:"information", options:"options", goal:"goal", social:"social", technology:"technology" } as const;
    for (const [key, dimension] of Object.entries(map)) if (get(key as GapField)) out.features[dimension as keyof typeof out.features] = get(key as GapField)!;
    const conditions = [get("constraints"), get("resources")].filter((v): v is Answer => !!v);
    const supportedConditions = conditions.filter((v) => recordStatus(v) !== "pending");
    if (supportedConditions.length) out.features.constraints = combine(supportedConditions)!;
    if (get("evaluation")) out.finalUserEvaluation = get("evaluation")!;
  }
  // Only already classified pre-decision slots populate matching features.
  // Outcomes, reflections and evaluations deliberately have no feature mapping.
  const ids = new Set(out.memoryRefs.map((r) => r._ref));
  for (const m of applicableSupplements(docs, scenario)) if (m.demo === event.demo && m.supplements?.some((s) => s.eventRef._ref === event._id) && !ids.has(m._id)) out.memoryRefs.push({ _type:"reference", _ref:m._id });
  return out;
}
export function effectiveEvents(docs: ArchiveDocument[], scenario: ScenarioContext | null = null): HistoricalEvent[] {
  return docs.filter((d): d is HistoricalEvent => d._type === "historicalEvent").map((e) => effectiveEvent(e, docs, scenario));
}
export function eventsAtSession(docs: ArchiveDocument[], session: Extract<ArchiveDocument, { _type:"empowermentSession" }>, scenario: ScenarioContext | null = null) {
  if (!session.sourceRevisionRefs) return docs.filter((d): d is HistoricalEvent => d._type === "historicalEvent");
  const ids = new Set(session.sourceRevisionRefs.map((r) => r._ref));
  return effectiveEvents(docs.filter((d) => d._type !== "memoryStatement" || !d.supplements?.length || ids.has(d._id)), scenario);
}
export function effectivePlanes(docs: ArchiveDocument[], scenario: ScenarioContext | null = null): Plane[] {
  const storedPlanes = docs.filter((d): d is Plane => d._type === "cognitionPlane");
  const superseded = new Set(
    storedPlanes
      .map((p) => p.supersedesPlaneRef?._ref)
      .filter((id): id is string => Boolean(id)),
  );
  return storedPlanes
    .filter((p) => !superseded.has(p._id))
    .filter(
      (p) =>
        p.anchorType !== "future_observed" ||
        Boolean(p.confirmation?.verbatim.trim()),
    )
    .map((stored) => {
    const plane = structuredClone(stored);
    if (plane.anchorType === "T0") return plane; // never reinterpret registration answers
    const linked = docs.filter((d): d is HistoricalEvent => d._type === "historicalEvent" && d.demo === plane.demo && plane.sourceEventRefs.some((r) => r._ref === d._id));
    const nodeFields = linked.flatMap((e) => auditEvent(e, docs, scenario).nodes.flatMap((n) => n.fields));
    // These are direct source slots, not personality or cognition-radius inferences.
    const map = { options:"visibleOptionBreadth", resources:"resourceCapacity", technology:"technologyAccess" } as const;
    for (const [slot, dimension] of Object.entries(map)) {
      const records = [plane.fields[dimension], ...nodeFields.filter((f) => f.key === slot && f.answer && f.status !== "pending").map((f) => f.answer!)];
      const value = combine(records);
      if (value && recordStatus(value) !== "pending") plane.fields[dimension] = value;
    }
    plane.unknownFields = planeFields.filter((k) => recordStatus(plane.fields[k]) !== "recorded");
    return plane;
  });
}
export function auditArchive(docs: ArchiveDocument[], scenario: ScenarioContext | null = null) {
  const events = docs.filter((d): d is HistoricalEvent => d._type === "historicalEvent");
  const eventAudits = events.map((e) => auditEvent(e, docs, scenario));
  const nodes = eventAudits.flatMap((e) => e.nodes);
  const planes = effectivePlanes(docs, scenario);
  const orderedPlanes = timelineSections(planes).flatMap((s) => s.planes.map((p) => ({p, group:s.key})));
  const planeAudits = orderedPlanes.map(({p, group}) => {
    const related = eventAudits.filter((e) => p.sourceEventRefs.some((r) => r._ref === e.eventId));
    const baseline = docs.find((d) => d._type === "baselineT0" && d.planeRef._ref === p._id);
    return { planeId:p._id, title:p.title, group, anchorType:p.anchorType, periodStart:p.periodStart, periodEnd:p.periodEnd,
      eventIds:related.map((e) => e.eventId),
      baselineComplete: baseline?._type === "baselineT0" && baseline.answers.length === 10,
      recordedDimensions:planeFields.filter((k) => recordStatus(p.fields[k]) === "recorded"),
      unrecordedDimensions:planeFields.filter((k) => recordStatus(p.fields[k]) === "pending"),
      eventPendingCount:related.flatMap((e) => e.nodes).reduce((sum, n) => sum+n.pending.length,0),
      // A completed 10-question baseline is not the same as 20 measured cognitive dimensions.
      coreComplete: p.anchorType === "T0" ? baseline?._type === "baselineT0" && baseline.answers.length === 10 : related.length > 0 && related.every((e) => e.coreComplete) };
  });
  return { basis:"field-presence-and-provenance-not-semantic-accuracy" as const, eventAudits, planeAudits,
    summary:{ assessedNodes:nodes.length, coreCompleteNodes:nodes.filter((n) => n.coreComplete).length,
      pendingFields:nodes.reduce((sum,n) => sum+n.pending.length,0),
      corePendingFields:nodes.reduce((sum,n) => sum+n.coreTotal-n.coreRecorded,0),
      explicitUnknownFields:nodes.reduce((sum,n) => sum+n.explicitUnknownFields,0) },
    matchDimensions:dimensions.map((d) => ({key:d.key,label:d.label})) };
}
