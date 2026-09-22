import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {historicalEvent,type Features,type HistoricalEvent} from '../domain/model';
import {serverConfig} from './config';
import {repository,storageMode} from './repository';
import {tokens} from '../domain/similarity';
export function candidateQuery(features:Features){
 const words=[...new Set(Object.values(features).filter(v=>v.state==='known').flatMap(v=>tokens(v.text)))].slice(0,60);
 const clauses=Object.keys(features).map(k=>`features.${k}.text match ${JSON.stringify(words)}`);
 return `*[_type == "historicalEvent" && userId == "single-user" && status == "sealed" && (${clauses.join(' || ')})][0...50]{_id}`;
}
export async function retrieve(features:Features,personal=false):Promise<{events:HistoricalEvent[];mode:'context'|'sanity-groq'|'local-demo';notice:string}>{
 const c=serverConfig();const all=await repository(personal).all();
 const events=all.filter((d):d is HistoricalEvent=>d._type==='historicalEvent'&&d.demo!==personal);
 const mode=storageMode(personal);
 if(mode==='local-demo')return {events,mode,notice:'本地持久化档案；未使用 Sanity Context。'};
 if(!c.contextUrl||!c.organizationToken)return {events,mode,notice:'从 Sanity Content Lake 实时读取。Context 未授权；当前为 GROQ 回退，不是 Context 验收成功。'};
 const client=new Client({name:'tell-me-more-retrieval',version:'0.1.0'});
 try{
  const url=new URL(c.contextUrl);if(url.origin!=='https://api.sanity.io'||!url.pathname.startsWith('/v1/context/organizations/'))throw new Error('INVALID_CONTEXT_ENDPOINT');
  await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${c.organizationToken}`}}}));
  const listed=await client.listTools();if(!listed.tools.some(t=>t.name==='groq_query'))throw new Error('CONTEXT_DATASET_MODE_REQUIRED');
  const result=await client.callTool({name:'groq_query',arguments:{query:candidateQuery(features)}});
  if(result.isError)throw new Error('CONTEXT_QUERY_FAILED');
  let payload:unknown=result.structuredContent;
  if(!payload){const blocks=result.content as {type:string;text?:string}[];payload=JSON.parse(blocks.filter(b=>b.type==='text').map(b=>b.text).join(''));}
  const parsed=payload as {result?:{_id:string}[];meta?:{warnings?:unknown}};
  if(!Array.isArray(parsed.result)||parsed.meta?.warnings)throw new Error('CONTEXT_INCOMPLETE_RESULT');
  const ids=new Set(parsed.result.map(r=>r._id));
  return {events:events.filter(e=>ids.has(e._id)).map(e=>historicalEvent.parse(e)),mode:'context',notice:'Sanity Context MCP 召回候选 ID；Content Lake 回读完整原档后透明重排。'};
 }catch{return {events,mode:'sanity-groq',notice:'Context 连接或查询未通过；已明确回退到 Sanity Content Lake。请运行 npm run verify:sanity 检查配置。'};}
 finally{await client.close().catch(()=>{});}
}
