import { dimensions } from "./catalog";
import {
  currentDecision,
  ref,
  stated,
  type Features,
  type Answer,
  type HistoricalEvent,
} from "./model";

export { contentTokens as tokens } from "./lexical";
import { contentTokens as tokens } from "./lexical";
export const ALGORITHM_VERSION = "content-overlap-v2";

export function currentFeatures(input: unknown, id: string): Features {
  const v = currentDecision.parse(input);
  // Only direct fields or explicit user labels, never inferred roles, motives or era.
  const direct = {
    domain: ["happened", v.happened],
    constraints: ["urgency", v.urgency],
    options: ["options", v.options],
  } as const;
  const labels = {
    role: "角色",
    goal: "目标",
    information: "信息",
    social: "关系",
    technology: "技术",
  } as const;
  return Object.fromEntries(
    dimensions.map(({ key }) => {
      if (key in direct) {
        const [field, text] = direct[key as keyof typeof direct];
        return [key, stated(text, id, `current.${field}`)];
      }
      const label = labels[key as keyof typeof labels];
      for (const [field, text] of Object.entries(v)) {
        const found = text.match(
          new RegExp(`(?:^|[\\n；;])\\s*${label}[：:]\\s*([^\\n；;]+)`),
        );
        if (found) return [key, stated(found[1], id, `current.${field}`)];
      }
      return [key, stated("未明确记录", id, "current", "unknown")];
    }),
  ) as Features;
}
function supported(a: Answer): boolean {
  return a.state === "known" && a.provenance.length > 0 &&
    a.provenance.every((p) => p.strength !== "AI_INFERENCE" && p.quote.trim().length > 0);
}
export function compare(features: Features, event: HistoricalEvent) {
  const components = dimensions.map((d) => {
    const a = features[d.key],
      b = event.features[d.key];
    const comparable =
      supported(a) && supported(b) &&
      tokens(a.text).length > 0 && tokens(b.text).length > 0;
    const left = comparable ? tokens(a.text) : [],
      right = comparable ? tokens(b.text) : [];
    const matched = left.filter((t) => right.includes(t));
    const union = new Set([...left, ...right]).size;
    return {
      ...d,
      earned: comparable && union ? (d.weight * matched.length) / union : 0,
      comparable,
      matched,
      currentOnly: left.filter((t) => !right.includes(t)),
      historicalOnly: right.filter((t) => !left.includes(t)),
      currentSource: a.provenance[0].sourceField,
      historicalSource: `features.${d.key}`,
      eventRef: ref(event._id),
      provenance: b.provenance,
    };
  });
  return {
    eventRef: ref(event._id),
    score: Math.round(components.reduce((s, c) => s + c.earned, 0) * 100) / 100,
    coverage: components
      .filter((c) => c.comparable)
      .reduce((s, c) => s + c.weight, 0),
    components,
  };
}
export function rank(features: Features, events: HistoricalEvent[]) {
  return events
    .map((e) => compare(features, e))
    .filter(isRelevantMatch)
    .sort(
      (a, b) =>
        b.score - a.score || a.eventRef._ref.localeCompare(b.eventRef._ref),
    );
}

function knownAnswerText(value: Answer | undefined): string {
  return value?.state === "known" ? value.text : "";
}

function eventDecisionTimeText(event: HistoricalEvent): string {
  return Object.values(event.features)
    .filter((value) => value.state === "known")
    .map((value) => value.text)
    .join("\n");
}

function eventLaterOnlyTexts(event: HistoricalEvent): string[] {
  return [
    ...event.laterLearned.map(knownAnswerText),
    ...event.outcomeFacts.map(knownAnswerText),
    ...event.laterEvaluations.map(knownAnswerText),
    ...event.currentInterpretations.map(knownAnswerText),
    knownAnswerText(event.finalUserEvaluation),
    ...event.decisionNodes.flatMap((node) => [
      knownAnswerText(node.immediateResult),
      knownAnswerText(node.longTermResult),
      knownAnswerText(node.userEvaluationLater),
    ]),
  ].filter((text) => text.trim().length > 0);
}

function tokenOverlap(leftText: string, rightText: string) {
  const left = [...new Set(tokens(leftText))];
  const right = [...new Set(tokens(rightText))];
  const rightSet = new Set(right);
  const matched = left.filter((token) => rightSet.has(token));
  const union = new Set([...left, ...right]).size;
  return {
    score: union ? Math.round((matched.length / union) * 10000) / 100 : 0,
    matched,
  };
}

/**
 * Intentionally wrong comparison used only by the public Hindsight Leakage lab.
 * It flattens decision-time facts and later outcomes into one searchable record.
 * Production matching must never call this function.
 */
export function leakyWholeHistoryRank(
  current: unknown,
  events: HistoricalEvent[],
) {
  const v = currentDecision.parse(current);
  const query = [v.happened, v.urgency, v.options, v.stuck].join("\n");
  const queryTokens = [...new Set(tokens(query))];

  return events
    .map((event) => {
      const preDecision = eventDecisionTimeText(event);
      const laterTexts = eventLaterOnlyTexts(event);
      const later = laterTexts.join("\n");
      const full = [preDecision, later].filter(Boolean).join("\n");
      const overlap = tokenOverlap(query, full);
      const preTokens = new Set(tokens(preDecision));
      const laterTokens = new Set(tokens(later));
      const leakedMatched = queryTokens.filter(
        (token) => laterTokens.has(token) && !preTokens.has(token),
      );
      const leakedSet = new Set(leakedMatched);
      const laterEvidence = laterTexts.filter((text) =>
        tokens(text).some((token) => leakedSet.has(token)),
      );

      return {
        eventRef: ref(event._id),
        score: overlap.score,
        matched: overlap.matched,
        leakedMatched,
        laterEvidence,
      };
    })
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.eventRef._ref.localeCompare(b.eventRef._ref),
    );
}

// An information-source, a generic deadline, or a shared tool alone does not make
// two decisions analogous. At least a recorded subject, goal or option must match.
export function isRelevantMatch(m: ReturnType<typeof compare>): boolean {
  return m.score > 0 && m.components.some((c) =>
    ["domain", "goal", "options"].includes(c.key) && c.matched.length > 0,
  );
}
export function matchBasis(m: { components: { key: string; matched: string[] }[] }): string {
  const structural = m.components.filter((c) =>
    ["domain", "goal", "constraints", "options", "role"].includes(c.key) && c.matched.length > 0,
  );
  return structural.length >= 2 ? "多项字段有共同原词" : "单项话题线索，条件尚不足";
}
