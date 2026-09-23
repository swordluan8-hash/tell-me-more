import { describe,it,expect } from "vitest";
import { demoDocuments } from "../packages/domain/seed";
import { auditArchive,auditEvent,recordStatus,effectiveEvent,eventsAtSession } from "../packages/domain/completeness";
import { buildSupplement } from "../packages/domain/supplements";
import { archiveDocument,evidence,ref,type HistoricalEvent,type ArchiveDocument } from "../packages/domain/model";
import { currentFeatures,rank,compare } from "../packages/domain/similarity";
import { gapFieldKeys,gapCatalog } from "../packages/domain/gap-catalog";
import type { ScenarioContext } from "../packages/domain/temporal";
function fixture(){
 const docs=demoDocuments();const event=docs.find((d):d is HistoricalEvent=>d._type==="historicalEvent")!;
 const missing={state:"unknown" as const,text:"本轮未提供，待后续补充；不是用户回答“不知道”。",provenance:[evidence(event._id,"missing","","AI_INFERENCE")]};
 event.fields.options=structuredClone(missing);event.features.options=structuredClone(missing);event.decisionNodes[0].optionsVisible=structuredClone(missing);
 return {docs,event,missing};
}
function request(e:HistoricalEvent,quote="先做小范围试点；暂缓合作。",field="options",state="known"){
 return {eventId:e._id,decisionId:e.decisionNodes[0].decisionId,verbatim:quote,updates:[{field,state,quote}],confirmed:true,demo:e.demo};
}
describe("constitutional gap loop",()=>{
 it("system placeholders do not count as an explicit unknown answer",()=>{
  const {missing,event,docs}=fixture();expect(recordStatus(missing)).toBe("pending");
  expect(auditEvent(event,docs).nodes[0].fields.find((f)=>f.key==="options")?.question).not.toBeNull();
 });
 it("user explicit unknown is complete but never factual evidence",()=>{
  const {event,docs}=fixture();const r=buildSupplement(request(event,"记不清","options","forgotten"),docs).document;
  const field=auditEvent(event,[...docs,r]).nodes[0].fields.find((f)=>f.key==="options")!;
  expect(field.status).toBe("explicit_unknown");expect(field.question).toBeNull();
  expect(effectiveEvent(event,[...docs,r]).features.options.state).toBe("forgotten");
 });
 it("an already-recorded field does not cause repeat questioning",()=>{
  const {event,docs}=fixture();const f=auditEvent(event,docs).nodes[0].fields.find((f)=>f.key==="event")!;
  expect(f.status).toBe("recorded");expect(f.question).toBeNull();
 });
 it("exact quoted confirmation closes only the targeted gap without mutating history",()=>{
  const {event,docs}=fixture(),before=structuredClone(docs);const original=auditEvent(event,docs);
  const {document}=buildSupplement(request(event),docs);expect(archiveDocument.safeParse(document).success).toBe(true);
  const result=auditEvent(event,[...docs,document]);
  expect(result.nodes[0].pending.length).toBe(original.nodes[0].pending.length-1);
  expect(docs).toEqual(before);expect(result.nodes[0].fields.find((f)=>f.key==="options")?.answer?.provenance[0].sourceRef._ref).toBe(document._id);
 });
 it("a classified supplement changes the matching input on the next use",()=>{
  const {event,docs}=fixture();const input={happened:"合成情境",urgency:"时间有限",options:"先做小范围试点；暂缓合作。",stuck:"目标：确认边界"};
  const f=currentFeatures(input,"current");const before=compare(f,event);
  const {document}=buildSupplement(request(event),docs);const view=effectiveEvent(event,[...docs,document]);
  const after=compare(f,view);
  expect(before.components.find((c)=>c.key==="options")?.comparable).toBe(false);
  expect(after.components.find((c)=>c.key==="options")?.earned).toBeGreaterThan(0);
  expect(rank(f,[view]).length).toBeGreaterThan(0);
 });
 it("unclassified new prose is kept but cannot close a field by guessing",()=>{
  const {event,docs}=fixture();const m:ArchiveDocument={_id:"extra",_type:"memoryStatement",userId:"single-user",demo:true,status:"sealed",recordedAt:new Date().toISOString(),sealedAt:new Date().toISOString(),verbatim:"也许当时还有其他情况。",artifactRefs:[],eventRefs:[ref(event._id)],classifications:[],sourceProvenance:[evidence("extra","verbatim","也许当时还有其他情况。") ]};
  expect(auditEvent(event,[...docs,m]).nodes[0].pending).toEqual(auditEvent(event,docs).nodes[0].pending);
 });
 it("outcome/evaluation supplementation cannot alter pre-decision similarity",()=>{
  const {event,docs}=fixture();const f=currentFeatures({happened:"合作",urgency:"时间有限",options:"试点",stuck:"信息：边界不明"},"current");
  const before=compare(f,effectiveEvent(event,docs));
  const q="后来完全失败了，但我现在认可当时的决定。";
  const {document}=buildSupplement({...request(event,q,"outcome"),updates:[{field:"outcome",state:"known",quote:q},{field:"evaluation",state:"known",quote:q}]},docs);
  expect(compare(f,effectiveEvent(event,[...docs,document]))).toEqual(before);
 });
 it("actual action never auto-fills the user's subjective best choice",()=>{
  const {event,docs,missing}=fixture();event.decisionNodes[0].historicalBestDecisionStatement=missing;
  const field=auditEvent(event,docs).nodes[0].fields.find((f)=>f.key==="historicalBest");
  expect(field?.status).toBe("pending");
 });
 it("two decision nodes do not share their answers silently",()=>{
  const {event,docs}=fixture();const node=structuredClone(event.decisionNodes[0]);node.decisionId="second-decision";event.decisionNodes.push(node);
  const {document}=buildSupplement(request(event),docs);const r=auditEvent(event,[...docs,document]);
  expect(r.nodes[0].fields.find((f)=>f.key==="options")?.status).toBe("recorded");
  expect(r.nodes[1].fields.find((f)=>f.key==="options")?.status).toBe("pending");
 });
 it("later-viewpoint supplements cannot leak into an earlier simulated decision",()=>{
  const {event,docs}=fixture();const s:ScenarioContext={id:"s",asOfDate:"2026-05-28",timeZone:"Asia/Shanghai",t0PlaneId:"t0",recordIds:docs.map((d)=>d._id)};
  const {document}=buildSupplement(request(event),docs,{...s,asOfDate:"2026-09-23"});
  expect(auditEvent(event,[...docs,document],s).nodes[0].fields.find((f)=>f.key==="options")?.status).toBe("pending");
  expect(auditEvent(event,[...docs,document],{...s,asOfDate:"2026-09-23"}).nodes[0].fields.find((f)=>f.key==="options")?.status).toBe("recorded");
 });
 it("all core answers including explicit unknowns finish the loop with no repeat core questions",()=>{
  const {event,docs}=fixture();let current=docs;
  for(const field of gapFieldKeys){
   if(auditEvent(event,current).nodes[0].fields.find((f)=>f.key===field)?.status==="pending")current=[...current,buildSupplement(request(event,"不知道",field,"unknown"),current).document];
  }
  const r=auditEvent(event,current);expect(r.coreComplete).toBe(true);expect(r.nodes[0].nextQuestion).toBeNull();
 });
 it("rejects fabricated quotes, no-confirmation, cross-mode links, invalid node and fake fields",()=>{
  const {event,docs}=fixture(),p=request(event);
  expect(()=>buildSupplement({...p,confirmed:false},docs)).toThrow();
  expect(()=>buildSupplement({...p,verbatim:"未提供这个答案"},docs)).toThrow();
  expect(()=>buildSupplement({...p,demo:!event.demo},docs)).toThrow();
  expect(()=>buildSupplement({...p,decisionId:"absent"},docs)).toThrow();
  expect(()=>buildSupplement({...p,updates:[{field:"features.score",state:"known",quote:p.verbatim}]},docs)).toThrow();
 });
 it("rejects an exact duplicate supplement even if a retry uses a new request id",()=>{
  const {event,docs}=fixture();
  const first=buildSupplement({...request(event),requestId:"11111111-1111-4111-8111-111111111111"},docs).document;
  expect(()=>buildSupplement({...request(event),requestId:"22222222-2222-4222-8222-222222222222"},[...docs,first])).toThrow("DUPLICATE_SUPPLEMENT_CONTENT");
 });
 it("old and new statements coexist, without rewriting originals or choosing which is true",()=>{
  const {event,docs}=fixture();const original=event.fields.reason.text;
  const {document}=buildSupplement(request(event,"当时我还有另一个理由。","reason"),docs);
  const f=auditEvent(event,[...docs,document]).nodes[0].fields.find((f)=>f.key==="reason")!;
  expect(f.records.some((a)=>a.text===original)).toBe(true);expect(f.records.some((a)=>a.text==="当时我还有另一个理由。")).toBe(true);expect(event.fields.reason.text).toBe(original);
 });
 it("plane gap counts reflect the linked event, but a finished T0 questionnaire is not reopened",()=>{
  const {event,docs}=fixture();const r=auditArchive(docs);const p=r.planeAudits.find((p)=>p.eventIds.includes(event._id));
  expect(p).toBeDefined();expect(p!.eventPendingCount).toBeGreaterThan(0);
  expect(r.planeAudits.some((p)=>p.anchorType==="T0"&&p.baselineComplete)).toBe(true);
 });
 it("old sessions do not silently use later supplemental answers on replay",()=>{
  const {event,docs}=fixture();
  const session:Extract<ArchiveDocument,{_type:"empowermentSession"}>={_id:"snapshot",_type:"empowermentSession",userId:"single-user",demo:true,status:"sealed",recordedAt:new Date().toISOString(),sealedAt:new Date().toISOString(),current:{happened:"合作",urgency:"时间",options:"选择",stuck:"信息"},currentFeatures:currentFeatures({happened:"合作",urgency:"时间",options:"选择",stuck:"信息"},"snapshot"),retrievalMode:"local-demo",retrievalNotice:"测试",matches:[],sourceProvenance:[],conclusion:"历史是参照，最终选择由你完成。"};
  const {document}=buildSupplement(request(event),docs);
  const replay=eventsAtSession([...docs,document],{...session,sourceRevisionRefs:[]});
  expect(replay.find((e)=>e._id===event._id)?.features.options.state).toBe("unknown");
 });
 it("all generated questions have a specific catalogue field and contain no predicted answer",()=>{
  for(const item of Object.values(gapCatalog)){expect(item.question.length).toBeGreaterThan(5);expect(item.question).not.toMatch(/你应该|因为你冲动|是否后悔|性格/);}
 });
 it("normal answers never acquire an invented earlier date from the request",()=>{
  const {event,docs}=fixture();expect(()=>buildSupplement({...request(event),viewpointDate:"1990-01-01"},docs)).toThrow();
 });
});
