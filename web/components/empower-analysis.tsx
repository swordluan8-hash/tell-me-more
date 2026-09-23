"use client";
import type { EmpowermentAnalysis } from "../../packages/domain/empowerment-analysis";

export default function EmpowerAnalysisView({
  analysis,
}: {
  analysis: EmpowermentAnalysis;
}) {
  const changed = analysis.cognitionAndCapability.dimensions.filter((d) => d.status === "changed");
  const stable = analysis.cognitionAndCapability.dimensions.filter((d) => d.status === "stable");
  const capability = analysis.cognitionAndCapability.capabilitySnapshot;
  const resourceItems = [...capability.resourceEvidence, ...capability.constraintEvidence].slice(0, 8);
  return (
    <section className="empower-analysis" data-testid="empower-analysis">
      <div className="section-heading">
        <div>
          <p className="eyebrow">EMPOWER ANALYSIS V1 · 赋能算法输出</p>
          <h2>不是只找历史：把过去转成当前决策检查点。</h2>
        </div>
        <span className="pill">{analysis.algorithmVersion}</span>
      </div>
      <p className="lead">{analysis.principle}</p>

      <div className="empowerment-targets">
        <article>
          <span>COGNITION EMPOWERMENT / 认知赋能</span>
          <h3>这次要提高的是判断方法，不是替你选答案。</h3>
          {analysis.empowermentTargets.cognition.length ? (
            <ul>
              {analysis.empowermentTargets.cognition.map((item) => (
                <li key={item.key}><b>{item.title}</b>：{item.action}</li>
              ))}
            </ul>
          ) : (
            <p>现有证据不足以形成额外认知改进项。</p>
          )}
          <p className="analysis-method-change">
            <b>当前决策方法：</b>
            {analysis.cognitionAndCapability.methodChange.currentActionStyle || "未记录"}
            {" / "}
            {analysis.cognitionAndCapability.methodChange.currentUncertaintyHandling || "未记录"}
          </p>
          <small>{analysis.cognitionAndCapability.methodChange.conclusion}</small>
        </article>
        <article>
          <span>CAPABILITY EMPOWERMENT / 能力赋能</span>
          <h3>把想法变成能执行、能验证、能止损的行动条件。</h3>
          {analysis.empowermentTargets.capability.length ? (
            <ul>
              {analysis.empowermentTargets.capability.map((item) => (
                <li key={item.key}><b>{item.title}</b>：{item.action}</li>
              ))}
            </ul>
          ) : (
            <p>当前执行能力/资源证据不足以形成具体改进项。</p>
          )}
        </article>
      </div>
      <div className="analysis-grid">
        <article className="analysis-card">
          <span>01 / 当前决策结构</span>
          <h3>{analysis.currentDecisionCompleteness.recorded.length} / 8 个决策维度已明确</h3>
          <p>已明确：{analysis.currentDecisionCompleteness.recorded.map((v) => v.label).join(" · ")}</p>
          {analysis.currentDecisionCompleteness.missing.length > 0 ? (
            <p className="analysis-gap">当前还缺：{analysis.currentDecisionCompleteness.missing.map((v) => v.label).join(" · ")}</p>
          ) : (
            <p>八个结构维度都有明确输入。</p>
          )}
        </article>

        <article className="analysis-card">
          <span>02 / 可见选项是否扩展</span>
          {analysis.cognitionAndCapability.optionBreadth ? (
            <>
              <h3>当前明确看见 {analysis.cognitionAndCapability.optionBreadth.currentOptionCount} 条路径</h3>
              <p>
                相似历史中最多明确记录 {analysis.cognitionAndCapability.optionBreadth.maxHistoricalOptionCount} 条路径；本次状态：
                <b> {analysis.cognitionAndCapability.optionBreadth.status === "expanded" ? "可见选项数量扩大" : analysis.cognitionAndCapability.optionBreadth.status === "same_count" ? "数量相同" : "当前明确选项更少"}</b>
              </p>
              <small>{analysis.cognitionAndCapability.optionBreadth.note}</small>
            </>
          ) : (
            <p>现有数据不足以比较可见选项数量。</p>
          )}
        </article>

        <article className="analysis-card">
          <span>03 / 认知平面对比</span>
          <h3>{analysis.cognitionAndCapability.comparedHistoricalPlaneCount} 个历史认知平面 ↔ 当前基线</h3>
          <p>已确认变化：{changed.length} 项 · 保持原文相同：{stable.length} 项</p>
          <small>{analysis.cognitionAndCapability.rule}</small>
        </article>
      </div>

      {analysis.decisionInfluence.decisionActions.length > 0 && (
        <section className="decision-actions" data-testid="decision-actions">
          <div className="section-heading">
            <div>
              <p className="eyebrow">DECISION IMPROVEMENT / 这次怎么提高决策质量</p>
              <h2>算法要求这次先改进这些决策动作。</h2>
            </div>
          </div>
          <div className="decision-action-grid">
            {analysis.decisionInfluence.decisionActions.map((item, i) => (
              <article key={item.key}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <h3>{item.title}</h3>
                <p>{item.action}</p>
                <details>
                  <summary>为什么这么要求 · 查看来源</summary>
                  {item.evidence.map((e, j) => (
                    <p className="source" key={j}>
                      {"quote" in e && e.quote ? e.quote : "历史事件提供结构证据"}
                      <br />
                      {"eventRef" in e && e.eventRef ? e.eventRef : "sourceRef" in e ? e.sourceRef : ""}
                    </p>
                  ))}
                </details>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="section-heading analysis-subhead">
        <div>
          <p className="eyebrow">DECISION IMPACT / 历史如何影响现在</p>
          <h2>每条相似历史都转成一个当前决策检查点。</h2>
        </div>
      </div>
      <div className="impact-list">
        {analysis.decisionInfluence.historyCards.map((card, i) => (
          <article key={card.eventRef} className="impact-card">
            <span>{String(i + 1).padStart(2, "0")} · {card.date || "日期待补"}</span>
            <h3>{card.title}</h3>
            <p>
              <b>为什么影响当前：</b>
              {card.shared.length ? card.shared.map((v) => v.label + "（" + v.terms.join(" / ") + "）").join("；") : "没有足够共同结构"}
            </p>
            <p><b>过去怎么选：</b>{card.pastDecision || "未记录"}</p>
            <p><b>后来结果：</b>{card.result || "未记录"}</p>
            <p><b>后来怎么看：</b>{card.laterView || "未记录"}</p>
            <div className="impact-action">
              <b>对这次决策的作用：</b>
              <span>{card.checkpoint}</span>
            </div>
          </article>
        ))}
      </div>

      {analysis.decisionInfluence.processCheckpoints.length > 0 && (
        <div className="decision-checkpoints">
          <h3>需要从过去带到现在的决策改进点</h3>
          {analysis.decisionInfluence.processCheckpoints.map((item) => (
            <div key={item.eventRef}>
              <b>{item.title}</b>
              <p>历史复盘原话：{item.evidence}</p>
              <p>{item.action}</p>
            </div>
          ))}
        </div>
      )}

      <div className="section-heading analysis-subhead">
        <div>
          <p className="eyebrow">COGNITION + CAPABILITY / 认知与能力条件</p>
          <h2>把“现在比过去多了什么、还缺什么”分开看。</h2>
        </div>
      </div>
      <div className="capability-grid">
        <article>
          <span>当前信息 / 认知证据</span>
          {capability.informationEvidence.length ? capability.informationEvidence.map((e) => (
            <p key={e.sourceRef + e.field}>{e.quote}<small>{e.sourceRef}</small></p>
          )) : <p>暂无额外记录。</p>}
        </article>
        <article>
          <span>当前执行能力 / 工具条件</span>
          {capability.capabilityEvidence.length ? capability.capabilityEvidence.map((e) => (
            <p key={e.sourceRef + e.field}>{e.quote}<small>{e.sourceRef}</small></p>
          )) : <p>当前执行能力证据不足，不能判断提高。</p>}
        </article>
        <article>
          <span>当前资源 / 生存约束</span>
          {resourceItems.length ? resourceItems.map((e) => (
            <p key={e.sourceRef + e.field}>{e.quote}<small>{e.sourceRef}</small></p>
          )) : <p>当前资源/约束证据不足。</p>}
        </article>
      </div>

      <details className="cognition-delta-details">
        <summary>展开 20 个认知/能力维度的历史 ↔ 当前证据</summary>
        {analysis.cognitionAndCapability.dimensions.map((d) => (
          <div className="plane-diff" key={d.key}>
            <h3>
              {d.label} · {" "}
              {d.status === "changed" ? "已确认变化" : d.status === "stable" ? "保持相同" : d.status === "current_recorded_only" ? "当前有记录 / 历史缺记录" : d.status === "historical_recorded_only" ? "历史有记录 / 当前缺记录" : "证据不足"}
            </h3>
            {d.current && (
              <div>
                <span>当前 / T0</span>
                <p>{d.current.text}</p>
                <small>{d.current.sourceRefs.join(" · ")}</small>
              </div>
            )}
            {d.historical.map((h) => (
              <div key={h.planeRef}>
                <span>{h.periodStart || "时间待补"} · {h.title}</span>
                <p>{h.text}</p>
                <small>{h.sourceRefs.join(" · ")}</small>
              </div>
            ))}
          </div>
        ))}
      </details>
    </section>
  );
}
