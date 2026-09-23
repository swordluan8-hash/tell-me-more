import { describe, it, expect } from "vitest";
import { demoDocuments } from "../packages/domain/seed";
import { stated, type ArchiveDocument, type Features, type HistoricalEvent } from "../packages/domain/model";
import { compare, currentFeatures, rank, tokens } from "../packages/domain/similarity";
import { dateBounds, eligibleHistory, localDate, recallViewDate, timelineSections, type Plane, type ScenarioContext } from "../packages/domain/temporal";
const seed = demoDocuments();
const baseEvent = seed.find((d): d is HistoricalEvent => d._type === "historicalEvent")!;
const basePlane = seed.find((d): d is Plane => d._type === "cognitionPlane")!;
function features(values: Partial<Record<keyof Features, string>>): Features {
  return Object.fromEntries(Object.keys(baseEvent.features).map((k) => [k,
    values[k as keyof Features] ? stated(values[k as keyof Features]!, "quote", k) : stated("未提供", "quote", k, "unknown"),
  ])) as Features;
}
function event(values: Partial<Record<keyof Features, string>>, id = "test-event"): HistoricalEvent {
  return { ...structuredClone(baseEvent), _id: id, features: features(values) };
}
function plane(id: string, type: Plane["anchorType"], date: string): Plane {
  return { ...structuredClone(basePlane), _id: id, anchorType: type, periodStart: date, periodEnd: date, sourceEventRefs: [] };
}
const scenario: ScenarioContext = { id: "synthetic-clock-test", asOfDate: "2026-05-28", timeZone: "Asia/Shanghai", t0PlaneId: "t0", recordIds: ["prior", "no-date", "t0"] };

describe("content-only matching regressions", () => {
  it("does not split distinctive compound words into single characters", () => {
    expect(tokens("网约车抖音自媒体，YouTube，PR剪辑")).toEqual(expect.arrayContaining(["网约车", "抖音", "自媒体", "youtube", "pr", "剪辑"]));
    expect(tokens("网约车抖音")).not.toEqual(expect.arrayContaining(["网", "约", "车", "抖", "音"]));
  });
  it("cannot manufacture similarity from oral filler", () => {
    const text = "我 你 了 的 那个 这个 就是 所以 但是 今天 现在 一个 事情 选择 行业";
    expect(tokens(text)).toEqual([]);
    const f = features({ domain: text });
    expect(rank(f, [event({ domain: text })])).toEqual([]);
    expect(compare(f, event({domain:text})).coverage).toBe(0);
  });
  it("does not match unrelated decisions sharing only pronouns", () => {
    const f = features({ domain: "我这个就是网约车了", options: "我现在选抖音" });
    expect(rank(f, [event({domain:"我这个就是料理店了", options:"我现在选三文鱼"})])).toEqual([]);
  });
  it("does not call a shared video platform a comparable career decision", () => {
    const f = features({ domain: "职业转向", information: "YouTube" });
    expect(rank(f, [event({ domain: "购买手机", information: "YouTube" })])).toEqual([]);
  });
  it("admits explicit goals and options, not just same industry", () => {
    expect(rank(features({ goal: "谋生" }), [event({ goal: "增加谋生技能" })])).toHaveLength(1);
    expect(rank(features({ options: "抖音" }), [event({ options: "专职做抖音" })])).toHaveLength(1);
  });
  it("AI inference on either side is not evidence", () => {
    const f = features({ goal: "谋生" }), e = event({ goal: "谋生" });
    f.goal.provenance[0].strength = "AI_INFERENCE";
    expect(rank(f,[e])).toEqual([]);
    f.goal.provenance[0].strength = "LATER_RECALL"; e.features.goal.state = "forgotten";
    expect(rank(f,[e])).toEqual([]);
  });
  it("never uses the known ending to change a score", () => {
    const f = features({ options: "剪辑" }), e = event({ options: "剪辑" });
    const before = compare(f,e);
    e.fields.outcome.text = "网约车抖音YouTube剪辑谋生";
    e.fields.reflection.text = "成功失败好坏";
    e.decisionNodes[0].chosenAction.text = "未来判断";
    expect(compare(f,e)).toEqual(before);
  });
  it("preserves exact source text and scores do not depend on IDs or insertion order", () => {
    const a = event({ domain: "网约车", goal: "谋生" },"a"), b = event({domain:"房租"},"b");
    const f = features({domain:"网约车"});
    const untouched=JSON.stringify([a,b]);
    expect(rank(f,[b,a])[0].eventRef._ref).toBe("a");
    a._id="renamed";
    expect(rank(f,[a,b])[0].score).toEqual(rank(f,[b,{...a,_id:"a"}])[0].score);
    a._id="a"; expect(JSON.stringify([a,b])).toBe(untouched);
  });
  it("reads all explicit fields across newlines without backfilling unlabelled prose", () => {
    const f = currentFeatures({happened:"结束网约车", urgency:"收入不足", options:"自媒体", stuck:"信息：看过YouTube。\n目标：找谋生。\n技术：不了解AI。\n关系：朋友建议。"},"q");
    expect(f.goal.text).toBe("找谋生。");
    expect(f.technology.text).toBe("不了解AI。");
    expect(f.social.text).toBe("朋友建议。");
    expect(f.role.state).toBe("unknown");
  });
});

describe("time identity and uncertainty regressions", () => {
  it("retains year and month precision without accepting dates hidden in prose", () => {
    expect(dateBounds("2022")?.max).toBe("2022-12-31");
    expect(dateBounds("2022-08")?.min).toBe("2022-08-01");
    expect(dateBounds("2017年开店以后的转让阶段")).toBeNull();
    expect(dateBounds("2026-02-30")).toBeNull();
    expect(dateBounds("2026-13")).toBeNull();
    expect(dateBounds("2024-02-29")?.max).toBe("2024-02-29");
  });
  it("puts undated T-minus records in a separate pre-T0 group, never after T0", () => {
    const p = plane("prior","reconstructed_past","2022-08"), u = plane("no-date","reconstructed_past","转让期未明确年月"), t = plane("t0","T0","2026-05-28");
    const before=JSON.stringify([u,t,p]);
    const sections=timelineSections([u,t,p]);
    expect(sections.map(s=>s.key)).toEqual(["past","past-undated","t0"]);
    expect(sections[1].planes[0].periodStart).toBe("转让期未明确年月");
    expect(JSON.stringify([u,t,p])).toBe(before);
  });
  it("shows inconsistent date/type separately rather than silently coercing history", () => {
    const bad=plane("bad","reconstructed_past","2027-01");
    expect(timelineSections([bad,plane("t0","T0","2026-05-28")]).find(s=>s.key==="conflict")?.planes[0]._id).toBe("bad");
  });
  it("uses local date for actual collection, not UTC substring", () => {
    expect(localDate("2026-09-22T23:26:30.859Z")).toBe("2026-09-23");
    expect(localDate("2026-09-22T10:26:30.859Z")).toBe("2026-09-22");
  });
  it("separates scenario viewpoint from actual acquisition date and does not apply it to other records", () => {
    const original="2026-09-22T23:26:30.859Z";
    expect(recallViewDate("prior",original,scenario)).toBe("2026-05-28（测试视角）");
    expect(recallViewDate("unrelated",original,scenario)).toBe("2026-09-23");
    expect(recallViewDate("prior",original,null)).toBe("2026-09-23");
  });
  it("excludes post-cutoff and date-overlap events even if their words match perfectly", () => {
    const e=event({domain:"网约车"},"past"), f=event({domain:"网约车"},"future"), uncertain=event({domain:"网约车"},"overlap");
    e.eventStartDate=e.eventEndDate="2023"; f.eventStartDate=f.eventEndDate="2026-06-09";uncertain.eventStartDate=uncertain.eventEndDate="2026";
    const docs:ArchiveDocument[]=[plane("t0","T0","2026-05-28"),e,f,uncertain];
    const result=eligibleHistory([f,e,uncertain],docs,scenario);
    expect(result.events.map(d=>d._id)).toEqual(["past"]);
    expect(result.excluded).toEqual(["future","overlap"]);
  });
  it("needs an explicit past-plane relation for undated event eligibility", () => {
    const e=event({domain:"网约车"},"event-with-no-date");e.eventStartDate=e.eventEndDate=null;
    const t=plane("t0","T0","2026-05-28"), p=plane("no-date","reconstructed_past","不详");
    expect(eligibleHistory([e],[t],scenario).events).toEqual([]);
    p.sourceEventRefs=[{_type:"reference",_ref:e._id}];
    expect(eligibleHistory([e],[t,p],scenario).events).toHaveLength(1);
  });
  it("does not alter ordinary product operation without a configured test scenario", () => {
    const e=event({domain:"合作"});
    expect(eligibleHistory([e],[],null).events).toEqual([e]);
  });
});
