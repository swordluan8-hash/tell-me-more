import type { ArchiveDocument, HistoricalEvent } from "./model";
export type Plane = Extract<ArchiveDocument, { _type: "cognitionPlane" }>;
export type ScenarioContext = {
  id: string;
  asOfDate: string;
  timeZone: string;
  t0PlaneId: string;
  recordIds: string[];
};
export const DEFAULT_TIME_ZONE = "Asia/Shanghai";

// Bounds are comparison keys only. Never persist invented month/day values.
export function dateBounds(value: string | null | undefined): { min: string; max: string } | null {
  if (!value) return null;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  if (year < 1000 || year > 9999 || (m[2] && (month < 1 || month > 12))) return null;
  if (!m[2]) return { min: `${m[1]}-01-01`, max: `${m[1]}-12-31` };
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (m[3] && (day < 1 || day > last)) return null;
  if (!m[3]) return { min: `${value}-01`, max: `${value}-${last}` };
  return { min: value, max: value };
}
export function localDate(value: string | Date, timeZone = DEFAULT_TIME_ZONE): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(d.getTime())) return "时间未记录";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function localTimestamp(value: string, timeZone = DEFAULT_TIME_ZONE): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "时间未记录";
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(d);
  return `${localDate(d, timeZone)} ${time} (${timeZone})`;
}
export function recallViewDate(id: string, recordedAt: string, scenario: ScenarioContext | null): string {
  return scenario?.recordIds.includes(id)
    ? `${scenario.asOfDate}（测试视角）`
    : localDate(recordedAt, scenario?.timeZone);
}
export type TimelineSection = { key: string; title: string; notice?: string; planes: Plane[] };
export function timelineSections(planes: Plane[]): TimelineSection[] {
  const sections: TimelineSection[] = [
    { key: "past", title: "T−N · 已知时期的历史切片", notice: "只按已记录的日期精度排列；同年、同月或相互重叠的时期不代表已确定先后。", planes: [] },
    { key: "past-undated", title: "T−N · 具体日期待补", notice: "这些记录已标为基线以前；不因缺少年月日把它们排进未来，也不补造日期。", planes: [] },
    { key: "t0", title: "T0 · 初次基线", planes: [] },
    { key: "after", title: "T+N · 基线以后的记录", planes: [] },
    { key: "after-undated", title: "T+N · 具体日期待补", planes: [] },
    { key: "conflict", title: "时间关系待核对", notice: "日期与平面类型存在冲突；原记录未被改写。", planes: [] },
  ];
  const t0s = planes.filter((p) => p.anchorType === "T0");
  const t0 = t0s.length === 1 ? dateBounds(t0s[0].periodStart) : null;
  for (const p of planes) {
    const start = dateBounds(p.periodStart), end = dateBounds(p.periodEnd);
    let key: string;
    if (p.anchorType === "T0") key = "t0";
    else if (start && end && start.min > end.max) key = "conflict";
    else if (p.anchorType === "reconstructed_past") {
      key = t0 && start && start.min >= t0.min ? "conflict" : start && end ? "past" : "past-undated";
    } else {
      key = t0 && end && end.max < t0.min ? "conflict" : start && end ? "after" : "after-undated";
    }
    sections.find((s) => s.key === key)!.planes.push(p);
  }
  for (const s of sections) {
    if (["past", "t0", "after"].includes(s.key)) {
      s.planes.sort((a, b) => (dateBounds(a.periodStart)?.min || "").localeCompare(dateBounds(b.periodStart)?.min || ""));
    }
  }
  return sections.filter((s) => s.planes.length);
}
export function eligibleHistory(events: HistoricalEvent[], docs: ArchiveDocument[], scenario: ScenarioContext | null) {
  if (!scenario) return { events, excluded: [] as string[] };
  const cutoff = dateBounds(scenario.asOfDate)!;
  const baseline = docs.find((d): d is Plane => d._type === "cognitionPlane" && d._id === scenario.t0PlaneId);
  const baselineTime = baseline ? dateBounds(baseline.periodStart) : null;
  const undatedPast = new Set(docs.filter((d): d is Plane =>
    d._type === "cognitionPlane" && d.anchorType === "reconstructed_past" && scenario.recordIds.includes(d._id),
  ).flatMap((d) => d.sourceEventRefs.map((r) => r._ref)));
  const accepted = events.filter((e) => {
    const start = dateBounds(e.eventStartDate), end = dateBounds(e.eventEndDate || e.eventStartDate);
    if (start && end) return start.min <= end.max && end.max < cutoff.min;
    // Only explicit past-plane membership, not a guessed year from prose.
    return !e.eventStartDate && !!baselineTime && baselineTime.max <= cutoff.min && undatedPast.has(e._id);
  });
  const ids = new Set(accepted.map((e) => e._id));
  return { events: accepted, excluded: events.filter((e) => !ids.has(e._id)).map((e) => e._id) };
}
