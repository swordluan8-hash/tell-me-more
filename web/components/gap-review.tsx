"use client";
import { useState } from "react";
import type { Answer, ArchiveDocument } from "../../packages/domain/model";
import { auditArchive } from "../../packages/domain/completeness";
import { gapCatalog } from "../../packages/domain/gap-catalog";
import { unknownLabels } from "../../packages/domain/catalog";
import type { ScenarioContext } from "../../packages/domain/temporal";

type SavePayload = {eventId:string; decisionId:string; verbatim:string; updates:{field:string;state:Answer["state"];quote:string}[]; confirmed:true;demo:boolean;requestId:string};
export default function GapReview({documents,scenario,onSave}:{documents:ArchiveDocument[];scenario:ScenarioContext|null;onSave:(payload:SavePayload)=>Promise<void>}) {
  const report = auditArchive(documents,scenario);
  const [selected,setSelected]=useState("");
  const [nodeId,setNodeId]=useState("");
  const [fieldId,setFieldId]=useState("");
  const [state,setState]=useState<Answer["state"]>("known");
  const [text,setText]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [skipped,setSkipped]=useState<string[]>([]);
  const event=report.eventAudits.find((e)=>e.eventId===selected)||report.eventAudits.find((e)=>!e.coreComplete)||report.eventAudits[0];
  const node=event?.nodes.find((n)=>n.decisionId===nodeId)||event?.nodes[0];
  const pending=node?.fields.filter((f)=>f.status==="pending")||[];
  const eligible=pending.filter((f)=>!skipped.includes(`${event?.eventId}:${node?.decisionId}:${f.key}`));
  const gap=eligible.find((f)=>f.key===fieldId)||eligible.find((f)=>f.required)||eligible[0];
  const original=documents.find((d)=>d._id===event?.eventId);
  function resetAnswer(){setText("");setState("known");setConfirmed(false);setError("");}
  function chooseEvent(id:string){setSelected(id);setNodeId("");setFieldId("");resetAnswer();setNotice("");}
  return <>
    <div className="page-title"><p className="eyebrow">06 · COMPLETE THE MISSING CONTEXT</p><h1>只补缺口，不让你重讲。</h1>
      <p className="lead">先检查原话与来源，再按时间切片补问。八个访谈字段、实际选择和当时最佳选择是核心；目标、约束、资源等决定可比信息量。</p></div>
    <div className="panel" data-testid="gap-summary">
      <b>{report.summary.assessedNodes} 个选择节点 · {report.summary.coreCompleteNodes} 个核心字段记录完整</b>
      <p>核心待补 {report.summary.corePendingFields} 项；连同条件字段共 {report.summary.pendingFields} 项。明确未知 {report.summary.explicitUnknownFields} 项。</p>
      <small>这是记录完整度，不是认知评分。已回答“不知道／记不清／无法判断”的不再逼问；系统占位的“未提供”不能冒充你的回答。</small>
    </div>
    <details><summary>查看全部时间平面与缺口分布（{report.planeAudits.length} 个）</summary>
    <div className="gap-plane-list">
      {report.planeAudits.map((p)=><details className="panel" key={p.planeId} data-gap-plane={p.planeId}>
        <summary><b>{p.title}</b> · {p.anchorType==="T0" ? (p.baselineComplete?"十题基线已完整，不重问":"基线待完成") : `${p.eventPendingCount} 项待补`}</summary>
        <p>{p.periodStart}{p.periodEnd!==p.periodStart?` — ${p.periodEnd}`:""}</p>
        <p>认知维度：{p.recordedDimensions.length} 项有明确记录；{p.unrecordedDimensions.length} 项未覆盖。这些是切片，不宣称已经还原该时期的全部认知。</p>
        {p.eventIds.map((id)=><button type="button" className="secondary" key={id} onClick={()=>chooseEvent(id)}>检查这个节点并继续访谈</button>)}
        {p.anchorType==="T0"&&<p>新补充不覆盖十题原答。当前选择的未来结果不要求现在回答。</p>}
      </details>)}
    </div></details>
    {event&&node ? <section className="panel" data-testid="gap-interview">
      <label className="field">当前补充的历史节点<select aria-label="当前补充的历史节点" value={event.eventId} onChange={(e)=>chooseEvent(e.target.value)}>
        {report.eventAudits.map((e)=><option key={e.eventId} value={e.eventId}>{e.title}</option>)}
      </select></label>
      {event.nodes.length>1&&<label className="field">选择节点<select aria-label="选择节点" value={node.decisionId} onChange={(e)=>{setNodeId(e.target.value);setFieldId("");resetAnswer();}}>{event.nodes.map((n)=><option key={n.decisionId} value={n.decisionId}>节点 {n.index+1}</option>)}</select></label>}
      <h2>{event.title}</h2><p>核心记录 {node.coreRecorded}/{node.coreTotal}。{node.coreComplete?"核心已记录；明确未知仍不作事实证据。":"尚未完成访谈，不能把已保存当成已完整。"}</p>
      <details><summary>已记录的原话与仍缺的字段</summary>{node.fields.map((f)=><div className="review-row" key={f.key}>
        <b>{f.label} · {f.status==="pending"?"待补":f.status==="explicit_unknown"?"明确未知，已记录":"已有原话"}</b>
        {f.records.map((a,i)=><div key={i}><p>{a.text}</p><small className="source">{a.provenance.map((p)=>`${p.sourceRef._ref} / ${p.sourceField}`).join(" · ")}</small></div>)}
      </div>)}</details>
      {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
      {gap ? <form onSubmit={async(e)=>{
        e.preventDefault();if(!confirmed||!text.trim()||!original)return;setBusy(true);setError("");
        try{await onSave({eventId:event.eventId,decisionId:node.decisionId,verbatim:text,updates:[{field:gap.key,state,quote:text}],confirmed:true,demo:original.demo,requestId:crypto.randomUUID()});resetAnswer();setFieldId("");setNotice(`「${gap.label}」已追加保存，原档未改；现在只问剩余缺口。`);}catch(err){setError(err instanceof Error?err.message:"保存失败，原话仍留在输入框。");}finally{setBusy(false);}
      }}>
        <label className="field">待补字段<select aria-label="待补字段" value={gap.key} onChange={(e)=>{setFieldId(e.target.value);resetAnswer();}}>{eligible.map((f)=><option key={f.key} value={f.key}>{f.label}{f.required?"（核心）":"（条件）"}</option>)}</select></label>
        <h3 data-testid="neutral-gap-question">{gap.question}</h3>
        <p>提问依据：这个节点的「{gapCatalog[gap.key].label}」尚无明确原话。不是因为系统对你的经历作了判断。</p>
        <label className="field">回答状态<select aria-label="补充回答状态" value={state} onChange={(e)=>{const v=e.target.value as Answer["state"];setState(v);setText(v==="known"?"":unknownLabels[v]);setConfirmed(false);}}>
          <option value="known">按我的原话记录</option>{Object.entries(unknownLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}
        </select></label>
        <label className="field">我的补充原话<textarea aria-label="我的补充原话" rows={5} required value={text} onChange={(e)=>{setText(e.target.value);setConfirmed(false);}}/></label>
        <label className="check"><input aria-label="确认补充归入此字段" type="checkbox" checked={confirmed} required onChange={(e)=>setConfirmed(e.target.checked)}/>我确认以上原话归入本节点的「{gap.label}」，追加保存，不覆盖旧记录。</label>
        <div className="actions"><button className="primary" disabled={busy||!confirmed}>{busy?"保存中…":"保存补充并检查下一缺口"}</button>
        <button type="button" className="text-button" onClick={()=>{setSkipped([...skipped,`${event.eventId}:${node.decisionId}:${gap.key}`]);setFieldId("");resetAnswer();}}>暂缓这题，仍保留缺口</button></div>
      </form>:<p>{pending.length?"本节点剩余问题已暂缓，资料保留；可切换其他节点继续。":"本节点当前核查字段已有原话或明确未知，不再追加无依据的问题。"}</p>}
    </section>:<div className="panel">还没有可检查的历史节点。</div>}
  </>;
}
