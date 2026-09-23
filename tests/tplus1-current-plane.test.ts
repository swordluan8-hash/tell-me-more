import { describe, expect, it } from "vitest";
import { demoDocuments } from "../packages/domain/seed";
import { buildEmpowermentAnalysis } from "../packages/domain/empowerment-analysis";
import { currentFeatures } from "../packages/domain/similarity";
import type { ArchiveDocument } from "../packages/domain/model";
import type { Plane, ScenarioContext } from "../packages/domain/temporal";

const seed = demoDocuments();
const basePlane = seed.find((d): d is Plane => d._type === "cognitionPlane")!;

function plane(
  id: string,
  anchorType: Plane["anchorType"],
  date: string,
  actionStyle: string,
): Plane {
  const p = structuredClone(basePlane);
  p._id = id;
  p.anchorType = anchorType;
  p.periodStart = date;
  p.periodEnd = date;
  p.sourceEventRefs = [];
  p.fields.actionStyle = {
    ...p.fields.actionStyle,
    state: "known",
    text: actionStyle,
  };
  p.unknownFields = [];
  return p;
}

const current = {
  happened: "做视频与联盟营销",
  urgency: "六个月现金窗口",
  options: "继续视频；联盟营销",
  stuck:
    "角色：一人公司负责人；目标：拿到第一美元；信息：多来源核验；关系：主要与AI协作；技术：熟练使用AI",
};

describe("T+1 current cognition plane", () => {
  it("uses the latest future-observed plane as current when no scenario freezes time", () => {
    const t0 = plane("t0", "T0", "2026-05-28", "先收集足够信息再行动");
    const t1 = plane("t1", "future_observed", "2026-09-24", "边做边学并固定流程");
    const docs: ArchiveDocument[] = [t0, t1];
    const features = currentFeatures(current, "q");
    const analysis = buildEmpowermentAnalysis({
      current,
      currentFeatures: features,
      matches: [],
      events: [],
      documents: docs,
      scenario: null,
    });
    expect(analysis.cognitionAndCapability.currentPlane?.planeRef).toBe("t1");
    expect(analysis.cognitionAndCapability.baselineComparison?.baselinePlane.planeRef).toBe("t0");
    expect(
      analysis.cognitionAndCapability.baselineComparison?.dimensions.find(
        (d) => d.key === "actionStyle",
      )?.status,
    ).toBe("changed");
  });

  it("keeps T0 current when an as-of scenario is frozen at T0", () => {
    const t0 = plane("t0", "T0", "2026-05-28", "先收集足够信息再行动");
    const t1 = plane("t1", "future_observed", "2026-09-24", "边做边学并固定流程");
    const scenario: ScenarioContext = {
      id: "frozen-t0",
      asOfDate: "2026-05-28",
      timeZone: "Asia/Shanghai",
      t0PlaneId: "t0",
      recordIds: ["t0"],
    };
    const features = currentFeatures(current, "q");
    const analysis = buildEmpowermentAnalysis({
      current,
      currentFeatures: features,
      matches: [],
      events: [],
      documents: [t0, t1],
      scenario,
    });
    expect(analysis.cognitionAndCapability.currentPlane?.planeRef).toBe("t0");
    expect(analysis.cognitionAndCapability.baselineComparison).toBeNull();
  });
});
