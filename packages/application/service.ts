import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {artifact,archiveDocument,ref,evidence,stated,currentDecision,type ArchiveDocument} from '../domain/model';
import {base,createBaseline,createEvent,sealRequest} from '../domain/workflow';
import {currentFeatures,rank} from '../domain/similarity';
import {repository,storageMode} from '../storage/repository';
import {retrieve} from '../storage/context';

const artifactInput=z.object({title:z.string().trim().min(1).max(200),kind:z.enum(['text','image_metadata']),originalText:z.string().max(30000),originalDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),demo:z.boolean(),fileMetadata:artifact.shape.fileMetadata}).superRefine((v,c)=>{if(v.kind==='text'&&!v.originalText.trim())c.addIssue({code:'custom',message:'请填写原文'});if(v.kind==='image_metadata'&&!v.fileMetadata)c.addIssue({code:'custom',message:'请提供图片元数据'});});
export async function getArchive(personal=false){const docs=await repository(personal).all();return {documents:docs.filter(d=>d.demo!==personal),mode:storageMode(personal)};}
export async function perform(action:string,payload:unknown){
 if(action==='artifact'){
  const v=artifactInput.parse(payload),id=randomUUID(),raw=v.kind==='text'?v.originalText:JSON.stringify(v.fileMetadata);
  const document=artifact.parse({...base(id,'artifact',v.demo),...v,originalDate:v.originalDate?stated(v.originalDate,id,'originalDate'):stated('原始时间未记录',id,'originalDate','unknown'),sha256:createHash('sha256').update(raw).digest('hex')});
  await repository(!v.demo).append([document]);return {document,mode:storageMode(!v.demo)};
 }
 if(action==='baseline'){
  const v=z.object({choices:z.array(z.number().int().min(0).max(2)).length(10),demo:z.boolean()}).parse(payload);
  const documents=createBaseline(v.choices,v.demo,{baseline:randomUUID(),plane:randomUUID()});
  await repository(!v.demo).append(documents);return {documents,mode:storageMode(!v.demo)};
 }
 if(action==='seal'){
  const v=sealRequest.parse(payload),repo=repository(!v.demo),existing=await repo.all();
  if(!existing.some(d=>d._id===v.artifactId&&d._type==='artifact'&&d.demo===v.demo))throw new Error('ARTIFACT_NOT_FOUND');
  const documents=createEvent(v,{event:randomUUID(),memory:randomUUID()});
  await repo.append(documents);return {documents,mode:storageMode(!v.demo)};
 }
 if(action==='append-recall'){
  const v=z.object({eventId:z.string(),verbatim:z.string().min(1).max(30000),demo:z.boolean()}).parse(payload),repo=repository(!v.demo);
  const event=(await repo.all()).find(d=>d._id===v.eventId&&d._type==='historicalEvent'&&d.demo===v.demo);if(!event)throw new Error('EVENT_NOT_FOUND');
  const id=randomUUID();const document:ArchiveDocument={...base(id,'memoryStatement',v.demo),_type:'memoryStatement',verbatim:v.verbatim,artifactRefs:[],eventRefs:[ref(event._id)],classifications:[],sourceProvenance:[evidence(id,'verbatim',v.verbatim)]};
  await repo.append([document]);return {document};
 }
 if(action==='empower'){
  const v=z.object({current:currentDecision,demo:z.boolean()}).parse(payload),id=randomUUID();
  const features=currentFeatures(v.current,id),retrieved=await retrieve(features,!v.demo);
  const matches=rank(features,retrieved.events);
  const document=archiveDocument.parse({...base(id,'empowermentSession',v.demo),_type:'empowermentSession',current:v.current,currentFeatures:features,retrievalMode:retrieved.mode,retrievalNotice:retrieved.notice,matches,sourceProvenance:matches.flatMap(m=>m.components.flatMap(c=>c.provenance)),conclusion:'历史是参照，最终选择由你完成。'});
  await repository(!v.demo).append([document]);return {document,events:retrieved.events};
 }
 throw new Error('UNKNOWN_ACTION');
}
