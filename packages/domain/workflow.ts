import {z} from 'zod';
import {interviewFields, planeFields, questions, unknownLabels} from './catalog';
import {type Answer, type ArchiveDocument, type Features, type HistoricalEvent, evidence, ref, stated, historicalEvent} from './model';

export const draftAnswer=z.object({state:z.enum(['known','unknown','forgotten','cannot_judge','not_applicable']),text:z.string().min(1).max(20000)});
export const draftFields=z.object(Object.fromEntries(interviewFields.map(([k])=>[k,draftAnswer])) as Record<typeof interviewFields[number][0],typeof draftAnswer>);
export const sealRequest=z.object({artifactId:z.string().min(1),title:z.string().min(1).max(200),narration:z.string().min(1).max(30000),fields:draftFields,chosenAction:draftAnswer,historicalBest:draftAnswer,eventDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),confirmed:z.literal(true),artifactConfirmed:z.literal(true),demo:z.boolean()});
export function missingFields(fields:Record<string,{state?:string;text?:string}>){return interviewFields.filter(([k])=>!fields[k]?.state||!fields[k]?.text?.trim()).map(([key,label])=>({key,question:`尚缺「${label}」。请记录你的原话，或选择明确的未知状态。`}));}
export function base(id:string,type:ArchiveDocument['_type'],demo:boolean,now=new Date().toISOString()){return {_id:id,_type:type,userId:'single-user' as const,demo,status:'sealed' as const,recordedAt:now,sealedAt:now};}
export function createEvent(input:unknown,ids:{event:string;memory:string}):ArchiveDocument[]{
 const v=sealRequest.parse(input),now=new Date().toISOString();
 const a=(key:keyof typeof v.fields)=>stated(v.fields[key].text,ids.memory,`classifications.${key}`,v.fields[key].state);
 const fields=Object.fromEntries(interviewFields.map(([k])=>[k,a(k)])) as HistoricalEvent['fields'];
 const unknown=(field:string)=>stated('不知道',ids.memory,field,'unknown');
 const features:Features={domain:a('event'),role:a('role'),goal:unknown('goal'),constraints:unknown('constraints'),options:a('options'),information:a('knowledge'),social:unknown('social'),technology:unknown('technology')};
 const action=stated(v.chosenAction.text,ids.memory,'chosenAction',v.chosenAction.state);
 const best=stated(v.historicalBest.text,ids.memory,'historicalBestDecisionStatement',v.historicalBest.state);
 const source=evidence(ids.memory,'verbatim',v.narration);
 const event=historicalEvent.parse({...base(ids.event,'historicalEvent',v.demo,now),title:v.title,confirmedAt:now,eventStartDate:v.eventDate,eventEndDate:v.eventDate,datePrecision:v.eventDate?'day':'unknown',artifactRefs:[ref(v.artifactId)],memoryRefs:[ref(ids.memory)],fields,features,objectiveContext:a('event'),location:unknown('location'),physicalEnvironment:unknown('physicalEnvironment'),socialEnvironment:unknown('socialEnvironment'),userRoleAndPosition:a('role'),knownAtTheTime:[a('knowledge')],laterLearned:[unknown('laterLearned')],availableOptions:[a('options')],visibleOptionsLimitations:[unknown('visibleOptionsLimitations')],goalsAtTheTime:[unknown('goalsAtTheTime')],constraintsAtTheTime:[unknown('constraintsAtTheTime')],resourcesAtTheTime:[unknown('resourcesAtTheTime')],technologyLimitations:[unknown('technologyLimitations')],cognitionSlices:[a('knowledge')],decisionNodes:[{decisionId:crypto.randomUUID(),decisionTime:v.eventDate?stated(v.eventDate,ids.memory,'eventDate'):unknown('eventDate'),trigger:a('event'),informationAvailable:a('knowledge'),cognitionAtDecision:a('knowledge'),optionsVisible:a('options'),optionsNotVisibleOrUnknown:unknown('optionsNotVisibleOrUnknown'),goal:unknown('goal'),constraints:unknown('constraints'),resources:unknown('resources'),chosenAction:action,historicalBestDecisionStatement:best,reasonInUserWords:a('reason'),immediateResult:a('outcome'),longTermResult:unknown('longTermResult'),userEvaluationLater:a('evaluation'),provenanceRefs:[source]}],outcomeFacts:[a('outcome')],laterEvaluations:[a('evaluation')],currentInterpretations:[a('reflection')],finalUserEvaluation:a('evaluation'),sourceProvenance:[source],relatedEventRefs:[],appendOnlyRevisionRefs:[]});
 const classifications=[...interviewFields.map(([k])=>({field:k,quote:v.fields[k].text,sourceField:`fields.${k}`})),{field:'chosenAction',quote:v.chosenAction.text,sourceField:'chosenAction'},{field:'historicalBestDecisionStatement',quote:v.historicalBest.text,sourceField:'historicalBest'}];
 const memory:ArchiveDocument={...base(ids.memory,'memoryStatement',v.demo,now),_type:'memoryStatement',verbatim:v.narration,artifactRefs:[ref(v.artifactId)],eventRefs:[ref(ids.event)],classifications,sourceProvenance:[evidence(v.artifactId,'originalText','访谈物件锚点','CONTEMPORARY_RECORD',now)]};
 return [memory,event];
}
export function createBaseline(choices:number[],demo:boolean,ids:{baseline:string;plane:string}):ArchiveDocument[]{
 z.array(z.number().int().min(0).max(2)).length(10).parse(choices);
 const now=new Date().toISOString(),date=now.slice(0,10);
 const answers=choices.map((c,i)=>({question:i,choice:c,text:questions[i][1][c]}));
 const mapping:Partial<Record<typeof planeFields[number],number>>={workModel:1,relationshipModel:2,actionStyle:3,riskModel:4,informationSources:5,uncertaintyHandling:6,failureModel:8};
 const fields=Object.fromEntries(planeFields.map(k=>{const i=mapping[k];return [k,i===undefined?stated('问卷未记录此维度',ids.baseline,k,'unknown'):stated(answers[i].text,ids.baseline,`answers[${i}]`)];})) as Record<typeof planeFields[number],Answer>;
 return [{...base(ids.baseline,'baselineT0',demo,now),_type:'baselineT0',answers,planeRef:ref(ids.plane)}, {...base(ids.plane,'cognitionPlane',demo,now),_type:'cognitionPlane',title:'T0 · 注册时的我',periodStart:date,periodEnd:date,anchorType:'T0',sourceEventRefs:[],sourceProvenance:[evidence(ids.baseline,'answers','十题原始选择')],fields,confidenceByField:planeFields.map(field=>({field,strength:'LATER_RECALL' as const})),unknownFields:planeFields.filter(k=>fields[k].state!=='known')}];
}
export const unknownText=(state:keyof typeof unknownLabels)=>unknownLabels[state];
