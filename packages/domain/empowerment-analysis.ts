import { dimensions, planeFields } from "./catalog";
import { effectivePlanes } from "./completeness";
import type {
  ArchiveDocument,
  Features,
  HistoricalEvent,
} from "./model";
import type { ScenarioContext } from "./temporal";
import { rank } from "./similarity";

type Match = ReturnType<typeof rank>[number];
type CurrentDecision = {
  happened: string;
  urgency: string;
  options: string;
  stuck: string;
};

const planeLabels: Record<(typeof planeFields)[number], string> = {
  worldScope: "接触的世界范围",
  cognitionRadius: "认知范围",
  informationSources: "信息来源",
  technologyAccess: "技术接触",
  socialSampleRange: "社会样本",
  riskModel: "风险认识",
  opportunityModel: "机会认识",
  selfModel: "自我认识",
  relationshipModel: "关系状态",
  moneyModel: "金钱认识",
  workModel: "职业状态",
  learningModel: "学习方式",
  failureModel: "对过去选择的看法",
  timeHorizon: "时间跨度",
  actionStyle: "行动方式",
  uncertaintyHandling: "面对不确定性",
  visibleOptionBreadth: "可见选择",
  executionCapacity: "执行条件",
  resourceCapacity: "资源条件",
  physicalOrMemoryConstraints: "身体与记忆约束",
};

const processMarkers = [
  /没想太多/u,
  /没有想太多/u,
  /简单地认为/u,
  /冲动/u,
  /鲁莽/u,
  /单通道/u,
  /偏执/u,
  /选择又错/u,
  /判断错/u,
  /应该/u,
];

function knownText(value: { state: string; text: string } | undefined) {
  return value?.state === "known" ? value.text : "";
}

function normalized(text: string) {
  return text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function visibleOptionCount(text: string) {
  const lines = text
    .split(/[\n；;]/u)
    .map((v) => v.trim())
    .filter(Boolean);
  let count = lines.length;
  if (lines.length === 1 && /还是/u.test(lines[0])) count += 1;
  return count;
}

function laterView(event: HistoricalEvent) {
  const candidates = [
    event.fields.evaluation,
    event.fields.reflection,
    event.finalUserEvaluation,
    ...event.decisionNodes.map((n) => n.userEvaluationLater),
  ];
  return candidates.find((a) => a.state === "known")?.text || "";
}

function eventOptionCount(event: HistoricalEvent) {
  const texts = [
    ...event.decisionNodes.map((n) => knownText(n.optionsVisible)),
    ...event.availableOptions.map((a) => knownText(a)),
  ].filter(Boolean);
  return texts.length ? Math.max(...texts.map(visibleOptionCount)) : 0;
}

function currentContextEvidence(documents: ArchiveDocument[]) {
  const statements = documents.filter(
    (
      d,
    ): d is Extract<ArchiveDocument, { _type: "memoryStatement" }> =>
      d._type === "memoryStatement" && d.demo === false,
  );
  const categories = {
    information: [] as { quote: string; sourceRef: string; field: string }[],
    capability: [] as { quote: string; sourceRef: string; field: string }[],
    resource: [] as { quote: string; sourceRef: string; field: string }[],
    constraint: [] as { quote: string; sourceRef: string; field: string }[],
    options: [] as { quote: string; sourceRef: string; field: string }[],
    uncertainty: [] as { quote: string; sourceRef: string; field: string }[],
  };
  const rules: [keyof typeof categories, RegExp][] = [
    ["resource", /resources\.runway|cashflow|savings|resource/i],
    ["capability", /tooluse|prioraiuse|plannedaction|concretefirstaction|skill\./i],
    ["information", /information\.|selfstudy|referencecreator/i],
    ["constraint", /constraints\.|pressure|perceivednecessity/i],
    ["options", /visiblealternatives|contentdirection|candidatetopic|platformdirection/i],
    ["uncertainty", /uncertainty\.|outcomeexpectation|choiceconcern/i],
  ];
  for (const statement of statements) {
    for (const item of statement.classifications) {
      if (!/T0-context/i.test(item.field)) continue;
      for (const [category, pattern] of rules) {
        if (!pattern.test(item.field)) continue;
        const list = categories[category];
        if (
          !list.some(
            (e) =>
              e.quote === item.quote &&
              e.sourceRef === statement._id &&
              e.field === item.field,
          )
        )
          list.push({
            quote: item.quote,
            sourceRef: statement._id,
            field: item.field,
          });
      }
    }
  }
  return categories;
}

export type EmpowermentAnalysis = ReturnType<typeof buildEmpowermentAnalysis>;

export function buildEmpowermentAnalysis(input: {
  current: CurrentDecision;
  currentFeatures: Features;
  matches: Match[];
  events: HistoricalEvent[];
  documents: ArchiveDocument[];
  scenario: ScenarioContext | null;
}) {
  const { current, currentFeatures, matches, events, documents, scenario } = input;
  const eventById = new Map(events.map((e) => [e._id, e]));
  const matchedEvents = matches
    .map((m) => eventById.get(m.eventRef._ref))
    .filter((e): e is HistoricalEvent => Boolean(e));

  const dimensionCounts = new Map<
    string,
    { key: string; label: string; count: number; eventRefs: string[]; terms: string[] }
  >();
  for (const match of matches) {
    for (const component of match.components.filter((c) => c.matched.length)) {
      const prior = dimensionCounts.get(component.key) || {
        key: component.key,
        label: component.label,
        count: 0,
        eventRefs: [],
        terms: [],
      };
      prior.count += 1;
      prior.eventRefs.push(match.eventRef._ref);
      prior.terms.push(...component.matched);
      prior.terms = [...new Set(prior.terms)];
      dimensionCounts.set(component.key, prior);
    }
  }

  const recurringFactors = [...dimensionCounts.values()]
    .filter((d) => d.count >= 2)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const currentGaps = dimensions
    .filter(({ key }) => currentFeatures[key].state !== "known")
    .map(({ key, label }) => {
      const historicalSupport = matchedEvents.filter(
        (event) => event.features[key].state === "known",
      );
      return {
        key,
        label,
        historicalEventCount: historicalSupport.length,
        historicalEventRefs: historicalSupport.map((e) => e._id),
      };
    })
    .filter((g) => g.historicalEventCount > 0);

  const historyCards = matches.map((match) => {
    const event = eventById.get(match.eventRef._ref)!;
    const node = event.decisionNodes[0];
    const shared = match.components
      .filter((c) => c.matched.length)
      .map((c) => ({
        key: c.key,
        label: c.label,
        terms: c.matched,
      }));
    const later = laterView(event);
    const processFlag = processMarkers.some((p) => p.test(later))
      ? "recheck"
      : later
        ? "recorded"
        : "missing";
    return {
      eventRef: event._id,
      title: event.title,
      date: event.eventStartDate,
      score: match.score,
      coverage: match.coverage,
      shared,
      pastDecision: knownText(node.chosenAction),
      historicalBest: knownText(node.historicalBestDecisionStatement),
      reason: knownText(node.reasonInUserWords) || knownText(event.fields.reason),
      result:
        knownText(node.longTermResult) ||
        knownText(node.immediateResult) ||
        knownText(event.fields.outcome),
      laterView: later,
      processFlag,
      checkpoint:
        shared.length > 0
          ? `当前与这段历史在「${shared.map((v) => v.label).join("、")}」上有共同内容。最终选择前，重新核对这些共同条件今天是否仍成立，并把这次历史的结果与后来复盘作为决策检查点。`
          : "这条历史没有足够的共同结构，不应据此影响当前选择。",
    };
  });

  const processCheckpoints = historyCards
    .filter((card) => card.processFlag === "recheck")
    .map((card) => ({
      eventRef: card.eventRef,
      title: card.title,
      evidence: card.laterView,
      action:
        "把这次历史里用户后来明确质疑或修正的判断方式，转成当前决策的验证条件；先验证，再决定是否沿用过去的做法。",
    }));

  const planes = effectivePlanes(documents, scenario);
  const t0Planes = planes.filter((p) => p.anchorType === "T0");
  const currentPlane =
    (scenario && t0Planes.find((p) => p._id === scenario.t0PlaneId)) ||
    (t0Planes.length === 1 ? t0Planes[0] : undefined);

  const matchedPlanes = matchedEvents
    .flatMap((event) =>
      planes.filter((p) =>
        p.sourceEventRefs.some((r) => r._ref === event._id),
      ),
    )
    .filter(
      (plane, index, all) =>
        all.findIndex((p) => p._id === plane._id) === index,
    );

  const cognitionDimensions = currentPlane
    ? planeFields.map((key) => {
        const currentAnswer = currentPlane.fields[key];
        const historical = matchedPlanes
          .map((p) => ({ plane: p, answer: p.fields[key] }))
          .filter(({ answer }) => answer.state === "known");
        const currentKnown = currentAnswer.state === "known";
        let status:
          | "stable"
          | "changed"
          | "current_recorded_only"
          | "historical_recorded_only"
          | "insufficient";
        if (currentKnown && historical.length) {
          status = historical.every(
            ({ answer }) => normalized(answer.text) === normalized(currentAnswer.text),
          )
            ? "stable"
            : "changed";
        } else if (currentKnown) status = "current_recorded_only";
        else if (historical.length) status = "historical_recorded_only";
        else status = "insufficient";
        return {
          key,
          label: planeLabels[key],
          status,
          current:
            currentKnown
              ? {
                  text: currentAnswer.text,
                  sourceRefs: currentAnswer.provenance.map((p) => p.sourceRef._ref),
                }
              : null,
          historical: historical.map(({ plane, answer }) => ({
            planeRef: plane._id,
            title: plane.title,
            periodStart: plane.periodStart,
            text: answer.text,
            sourceRefs: answer.provenance.map((p) => p.sourceRef._ref),
          })),
        };
      })
    : [];

  const currentOptionCount = visibleOptionCount(current.options);
  const optionComparisons = matchedEvents
    .map((event) => ({
      eventRef: event._id,
      title: event.title,
      historicalOptionCount: eventOptionCount(event),
    }))
    .filter((v) => v.historicalOptionCount > 0);
  const maxHistoricalOptionCount = optionComparisons.length
    ? Math.max(...optionComparisons.map((v) => v.historicalOptionCount))
    : 0;
  const optionBreadth =
    currentOptionCount > 0 && maxHistoricalOptionCount > 0
      ? {
          status:
            currentOptionCount > maxHistoricalOptionCount
              ? ("expanded" as const)
              : currentOptionCount === maxHistoricalOptionCount
                ? ("same_count" as const)
                : ("narrower" as const),
          currentOptionCount,
          maxHistoricalOptionCount,
          comparisons: optionComparisons,
          note:
            "这里只比较明确写出的可见选项数量，不等于认知高低，也不代表某个选项更好。",
        }
      : null;

  const contextEvidence = currentContextEvidence(documents);

  const currentDecisionCompleteness = {
    recorded: dimensions
      .filter(({ key }) => currentFeatures[key].state === "known")
      .map(({ key, label }) => ({ key, label })),
    missing: dimensions
      .filter(({ key }) => currentFeatures[key].state !== "known")
      .map(({ key, label }) => ({ key, label })),
  };

  const decisionActions = [
    ...(currentGaps.some((g) => g.key === "role")
      ? [{
          key: "complete-role",
          title: "先补齐当前角色与责任位置",
          action:
            "当前 8 个决策维度里只有“角色与责任位置”没有明确。先写清这次你是以什么身份承担结果、责任边界在哪里，再比较各选项。",
          evidence: currentGaps
            .find((g) => g.key === "role")!
            .historicalEventRefs.map((eventRef) => ({ eventRef })),
        }]
      : []),
    ...(historyCards.some(
      (card) =>
        card.processFlag === "recheck" &&
        /错|没有想太多|没想太多|简单地认为|冲动|鲁莽|单通道|偏执/u.test(
          card.laterView,
        ),
    )
      ? [{
          key: "validation-rule",
          title: "把“凭早期感觉下结论”改成“先定义验证条件”",
          action:
            "相似历史里已经出现用户后来明确质疑当时判断方式的记录。这次不要只凭早期反馈或单次失败决定继续/放弃；先写清观察期、验证指标、停止条件，再用新证据更新判断。",
          evidence: historyCards
            .filter((card) => card.processFlag === "recheck")
            .map((card) => ({
              eventRef: card.eventRef,
              quote: card.laterView,
            })),
        }]
      : []),
    ...(historyCards.some(
      (card) =>
        /花了|购买|订购|课程|投入/u.test(
          card.pastDecision + card.reason + card.result,
        ),
    ) && contextEvidence.resource.length
      ? [{
          key: "staged-investment",
          title: "把投入改成分阶段验证，而不是一次性押注",
          action:
            "历史里有明确的资金/学习投入；当前又有现金流和可支撑时间记录。把本次投入拆成阶段，先设投入上限、验证周期和退出条件，避免“投入以后才决定要不要继续”。",
          evidence: [
            ...historyCards
              .filter((card) =>
                /花了|购买|订购|课程|投入/u.test(
                  card.pastDecision + card.reason + card.result,
                ),
              )
              .map((card) => ({
                eventRef: card.eventRef,
                quote: card.pastDecision,
              })),
            ...contextEvidence.resource.slice(0, 3).map((e) => ({
              sourceRef: e.sourceRef,
              quote: e.quote,
            })),
          ],
        }]
      : []),
    ...(historyCards.some(
      (card) =>
        /回到|重新进入/u.test(card.pastDecision) &&
        /下降|不赚钱|减少/u.test(card.result),
    )
      ? [{
          key: "fallback-is-not-safe-by-default",
          title: "旧路不能自动当作“安全退路”",
          action:
            "历史里存在“新尝试失败后回到旧路，但旧路结果继续恶化”的记录。当前如果把旧路径当备选，也要重新验证它今天是否还能满足生存目标，不能因为熟悉就默认安全。",
          evidence: historyCards
            .filter(
              (card) =>
                /回到|重新进入/u.test(card.pastDecision) &&
                /下降|不赚钱|减少/u.test(card.result),
            )
            .map((card) => ({
              eventRef: card.eventRef,
              quote: card.pastDecision + " / " + card.result,
            })),
        }]
      : []),
    ...(contextEvidence.capability.some((e) =>
      /不会用|不知道|没定|没有.*真正/u.test(e.quote),
    )
      ? [{
          key: "execution-readiness",
          title: "先把方向变成可执行的第一步",
          action:
            "当前记录里已经明确存在工具不会用、第一步未定、方向仍未完全确定的内容。先把“要做什么、第一步是什么、需要哪些工具、哪些不会”列成执行清单，再比较方案，而不是只比较想法。",
          evidence: contextEvidence.capability
            .filter((e) => /不会用|不知道|没定|没有.*真正/u.test(e.quote))
            .slice(0, 5)
            .map((e) => ({
              sourceRef: e.sourceRef,
              quote: e.quote,
            })),
        }]
      : []),
  ];

  const cognitionTargetKeys = new Set([
    "complete-role",
    "validation-rule",
    "fallback-is-not-safe-by-default",
  ]);
  const capabilityTargetKeys = new Set([
    "staged-investment",
    "execution-readiness",
  ]);
  const empowermentTargets = {
    cognition: decisionActions
      .filter((a) => cognitionTargetKeys.has(a.key))
      .map((a) => ({ key: a.key, title: a.title, action: a.action })),
    capability: decisionActions
      .filter((a) => capabilityTargetKeys.has(a.key))
      .map((a) => ({ key: a.key, title: a.title, action: a.action })),
  };

  const currentActionStyle =
    currentPlane?.fields.actionStyle.state === "known"
      ? currentPlane.fields.actionStyle.text
      : "";
  const currentUncertaintyHandling =
    currentPlane?.fields.uncertaintyHandling.state === "known"
      ? currentPlane.fields.uncertaintyHandling.text
      : "";
  const methodChange = {
    currentActionStyle,
    currentUncertaintyHandling,
    historicalReflections: processCheckpoints.map((p) => ({
      eventRef: p.eventRef,
      title: p.title,
      evidence: p.evidence,
    })),
    conclusion:
      currentActionStyle || currentUncertaintyHandling
        ? "当前 T0 已明确记录新的决策规则；与相似历史的后来复盘相比，可以确认判断方法发生了变化。但这不是整体能力高低评分。"
        : "当前决策方法记录不足，不能判断变化。",
  };

  const capabilitySnapshot = {
    informationEvidence: contextEvidence.information.slice(0, 8),
    capabilityEvidence: contextEvidence.capability.slice(0, 8),
    resourceEvidence: contextEvidence.resource.slice(0, 8),
    constraintEvidence: contextEvidence.constraint.slice(0, 8),
    optionEvidence: contextEvidence.options.slice(0, 8),
    uncertaintyEvidence: contextEvidence.uncertainty.slice(0, 8),
  };

  return {
    algorithmVersion: "empower-analysis-v1",
    principle:
      "输出决策改进依据与认知/能力变化证据，不输出唯一最终选择。",
    currentDecisionCompleteness,
    empowermentTargets,
    decisionInfluence: {
      matchedEventCount: matchedEvents.length,
      recurringFactors,
      currentGaps,
      historyCards,
      processCheckpoints,
      decisionActions,
    },
    cognitionAndCapability: {
      currentPlane: currentPlane
        ? {
            planeRef: currentPlane._id,
            title: currentPlane.title,
            periodStart: currentPlane.periodStart,
          }
        : null,
      comparedHistoricalPlaneCount: matchedPlanes.length,
      dimensions: cognitionDimensions,
      optionBreadth,
      capabilitySnapshot,
      methodChange,
      rule:
        "认知变化不等于成长；认知、执行能力、资源和约束分别呈现。没有证据的维度不判断。",
    },
  };
}
