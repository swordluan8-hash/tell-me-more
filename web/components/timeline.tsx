"use client";
import { useState } from "react";
import type { ArchiveDocument } from "../../packages/domain/model";
import { effectivePlanes } from "../../packages/domain/completeness";
import { questions } from "../../packages/domain/catalog";
import { timelineSections, localTimestamp, type Plane, type ScenarioContext } from "../../packages/domain/temporal";

const labels: Record<string, string> = {
  worldScope: "接触的世界范围", cognitionRadius: "认知范围", informationSources: "信息来源",
  technologyAccess: "技术接触", socialSampleRange: "社会样本", riskModel: "风险认识",
  opportunityModel: "机会认识", selfModel: "自我认识", relationshipModel: "关系状态",
  moneyModel: "金钱认识", workModel: "职业状态", learningModel: "学习方式",
  failureModel: "对过去选择的看法", timeHorizon: "时间跨度", actionStyle: "行动方式",
  uncertaintyHandling: "面对不确定性", visibleOptionBreadth: "可见选择",
  executionCapacity: "执行条件", resourceCapacity: "资源条件", physicalOrMemoryConstraints: "身体与记忆约束",
};
export default function Timeline({ documents, scenario }: { documents: ArchiveDocument[]; scenario: ScenarioContext | null }) {
  const [selectedId, setSelectedId] = useState("");
  const planes = effectivePlanes(documents, scenario);
  const sections = timelineSections(planes);
  const t0s = planes.filter((p) => p.anchorType === "T0");
  const t0 = (scenario && t0s.find((p) => p._id === scenario.t0PlaneId)) || (t0s.length === 1 ? t0s[0] : undefined);
  const datedPast = sections.find((s) => s.key === "past")?.planes || [];
  const pastPlanes = sections.filter((s) => s.key.startsWith("past")).flatMap((s) => s.planes);
  const past = pastPlanes.find((p) => p._id === selectedId) || datedPast.at(-1) || pastPlanes[0];
  const baseline = documents.find((d) => d._type === "baselineT0" && d.planeRef._ref === t0?._id);
  const comparable = past && t0 ? Object.keys(past.fields).filter((k) => {
    const key = k as keyof Plane["fields"];
    return past.fields[key].state === "known" && t0.fields[key].state === "known";
  }) : [];
  return <>
    <div className="page-title">
      <p className="eyebrow">05 · COGNITION THROUGH TIME</p>
      <h1>看见差异，不评判高低。</h1>
      <p className="lead">事件日期、回忆视角与实际采集时间分别显示。日期不明的历史单列，不补造年月日。</p>
    </div>
    {sections.map((section) => <section key={section.key} data-time-group={section.key}>
      <h2>{section.title}</h2>
      {section.notice && <p className="muted">{section.notice}</p>}
      <div className="timeline">
        {section.planes.map((p) => <article className="timeline-item" key={p._id} data-plane-id={p._id}>
          <span className="timeline-dot" />
          <small>{p.periodStart || "日期待补"}{p.periodEnd !== p.periodStart ? ` — ${p.periodEnd}` : ""}</small>
          <h2>{p.title}</h2>
          <span className="pill">{p.anchorType} · {p.demo ? "虚构演示" : "个人记录"}</span>
          <p className="source">实际采集：{localTimestamp(p.recordedAt, scenario?.timeZone)}</p>
          <p className="source">{p.sourceProvenance.map((s) => `${s.sourceRef._ref} / ${s.strength}`).join(" · ")}</p>
        </article>)}
      </div>
    </section>)}
    {baseline && baseline._type === "baselineT0" && <details data-testid="baseline-answers">
      <summary>T0 十题原答 · 不随后续叙述改写</summary>
      {baseline.answers.map((a) => <p key={a.question}><b>{a.question + 1}{"ABC"[a.choice]}</b> · {questions[a.question][0]}：{a.text}</p>)}
    </details>}
    {past && t0 ? <div className="panel" data-testid="plane-comparison">
      <h2>历史切片 ↔ T0 · 有据可查的差异</h2>
      <label className="field">选择要比较的历史切片
        <select aria-label="选择要比较的历史切片" value={past._id} onChange={(e) => setSelectedId(e.target.value)}>
          {pastPlanes.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
        </select>
      </label>
      <p>以下只比较原有字段；不同时间、不同处境下的原话不代表成长或退步。来源可以逐项核对。</p>
      {comparable.length === 0 && <p>这两个切片还没有共同记录的可比维度，不补值、不评分。</p>}
      {comparable.map((k) => {
        const key = k as keyof Plane["fields"], a = past.fields[key], b = t0.fields[key];
        return <div className="plane-diff" key={key}>
          <h3>{labels[key] || key} · {a.text === b.text ? "原文相同" : "原文不同"}</h3>
          {[{ title: past.periodStart, answer: a }, { title: `T0 · ${t0.periodStart}`, answer: b }].map(({ title, answer }, i) => <div key={i}>
            <span>{title}</span><p>{answer.text}</p>
            {answer.provenance.map((p, j) => <small className="source" key={j}>{p.sourceRef._ref} / {p.sourceField} / {p.strength}</small>)}
          </div>)}
        </div>;
      })}
      <details><summary>尚不能比较的维度</summary><p>{Object.keys(t0.fields).filter((k) => !comparable.includes(k)).map((k) => labels[k] || k).join(" · ")}</p></details>
    </div> : <div className="panel">尚无唯一基线与历史切片可供比较；不会混用其他基线或演示证据。</div>}
  </>;
}
