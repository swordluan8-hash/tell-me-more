import {createHash} from 'node:crypto';
import {base,createBaseline,createEvent} from './workflow';
import {type ArchiveDocument, type HistoricalEvent, evidence, ref, stated} from './model';
import {planeFields} from './catalog';

export function demoDocuments():ArchiveDocument[]{
 const records=[
  {n:1,date:'2018-04-12',title:'演示 · 在职责未明时加入合作',artifact:'【虚构演示邮件】项目下周启动。先开始合作，职责之后再讨论。',event:'一个新的合作项目出现，工作职责还没有明确。',role:'我负责项目交付，与合作伙伴共同承担工作责任。',knowledge:'收入与责任边界都很重要，目前信息不足。',options:'先做小范围试点；直接加入；暂缓合作。',reason:'当时我希望尽快获得收入，也相信伙伴可以一起补齐分工。',outcome:'两个月后交付延期，我承担了额外的协调工作。',reflection:'今天我想先把双方理解的职责写下来。',evaluation:'以当时的信息看可以理解，但我没有记录责任范围。',action:'直接加入合作。',best:'在当时收入与时间约束下，我认为先加入是当时最可行的选择。',goal:'收入与责任边界都很重要，目前信息不足。',constraints:'对方希望本周答复，时间有限。',social:'合作伙伴共同工作，职责还没有明确。',technology:'通过电子邮件和共享文档协作。'},
  {n:2,date:'2021-08-03',title:'演示 · 用试点确认合作边界',artifact:'【虚构演示备忘录】两周试点。双方分别确认交付范围，再讨论继续合作。',event:'一个新的合作项目出现，需要明确工作职责。',role:'我作为项目负责人，与合作伙伴共同交付。',knowledge:'收入与责任边界都很重要，试点前信息不足。',options:'先做小范围试点；直接加入；暂缓合作。',reason:'我想用有限时间了解实际工作范围。',outcome:'试点完成，双方缩小了后续合作范围。',reflection:'我仍认可把试点作为获取信息的方式。',evaluation:'当时的试点符合我的时间和资源条件。',action:'先做小范围试点。',best:'在已有时间与资源下，我认为先试点最合适。',goal:'收入与责任边界都很重要。',constraints:'对方希望本周答复，时间有限。',social:'合作伙伴共同工作。',technology:'使用线上会议与共享文档。'},
  {n:3,date:'2024-02-19',title:'演示 · 在时间不足时暂缓项目',artifact:'【虚构演示日记】已有项目尚未结束。新合作需本周回复，决定暂缓。',event:'一个新的合作项目出现，但手头工作尚未完成。',role:'我独立负责交付，同时协调合作伙伴。',knowledge:'已有项目的时间安排明确，新项目的收入信息不足。',options:'先做小范围试点；直接加入；暂缓合作。',reason:'当时我无法同时安排两个项目的时间。',outcome:'原项目按期完成，新合作没有继续。',reflection:'今天看来，我保留了已承诺的工作时间。',evaluation:'在当时的资源约束下，我认可暂缓的选择。',action:'暂缓合作。',best:'当时我认为先完成已有承诺，是能承担的选择。',goal:'收入与责任边界都很重要。',constraints:'对方希望本周答复，时间有限。',social:'合作伙伴与已有客户之间的工作安排。',technology:'通过电子邮件安排项目。'},
 ];
 const docs:ArchiveDocument[]=[];
 for(const r of records){
  const aid=`demo-artifact-${r.n}`,mid=`demo-memory-${r.n}`,eid=`demo-event-${r.n}`;
  docs.push({...base(aid,'artifact',true),_type:'artifact',title:r.title,kind:'text',originalText:r.artifact,originalDate:stated(r.date,aid,'originalDate'),sha256:createHash('sha256').update(r.artifact).digest('hex')});
  const fields=Object.fromEntries(['event','role','knowledge','options','reason','outcome','reflection','evaluation'].map(k=>[k,{state:'known',text:r[k as keyof typeof r]}]));
  const created=createEvent({artifactId:aid,title:r.title,narration:Object.values(fields).map(f=>f.text).join('\n'),fields,chosenAction:{state:'known',text:r.action},historicalBest:{state:'known',text:r.best},eventDate:r.date,confirmed:true,artifactConfirmed:true,demo:true},{event:eid,memory:mid});
  const event=created[1] as HistoricalEvent;
  for(const key of ['goal','constraints','social','technology'] as const){event.features[key]=stated(r[key],mid,`classifications.${key}`);}
  const mem=created[0];if(mem._type==='memoryStatement')for(const key of ['goal','constraints','social','technology'] as const)mem.classifications.push({field:key,quote:r[key],sourceField:`demoFixture.${key}`});
  docs.push(...created);
 }
 docs.push(...createBaseline([0,1,0,1,1,1,2,1,1,1],true,{baseline:'demo-baseline',plane:'demo-t0'}));
 const fields=Object.fromEntries(planeFields.map(k=>[k,stated('没有记录', 'demo-memory-1', k,'unknown')])) as Extract<ArchiveDocument,{_type:'cognitionPlane'}>['fields'];
 fields.informationSources=stated('收入与责任边界都很重要，目前信息不足。','demo-memory-1','classifications.knowledge');
 fields.actionStyle=stated('直接加入合作。','demo-memory-1','classifications.chosenAction');
 docs.push({...base('demo-past-plane','cognitionPlane',true),_type:'cognitionPlane',title:'2018 · 合作事件中的认知切片',periodStart:'2018-04-12',periodEnd:'2018-04-12',anchorType:'reconstructed_past',sourceEventRefs:[ref('demo-event-1')],sourceProvenance:[evidence('demo-memory-1','classifications','虚构演示回忆，非真实用户事实')],fields,confidenceByField:planeFields.map(field=>({field,strength:'LATER_RECALL'})),unknownFields:planeFields.filter(k=>fields[k].state!=='known')});
 return docs;
}
