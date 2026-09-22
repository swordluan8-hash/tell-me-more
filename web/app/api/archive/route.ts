import 'server-only';
import {NextRequest,NextResponse} from 'next/server';
import {getArchive,perform} from '../../../../packages/application/service';
import {ZodError} from 'zod';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function local(req:NextRequest){const host=req.headers.get('host')?.split(':')[0];return host==='localhost'||host==='127.0.0.1';}
export async function GET(req:NextRequest){
 if(!local(req))return NextResponse.json({error:'LOCAL_ONLY'},{status:403});
 try{return NextResponse.json(await getArchive(req.nextUrl.searchParams.get('personal')==='true'),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'档案读取失败。没有把远端故障伪装成本地成功。检查 Sanity 配置，或显式设置 TMM_STORAGE=local-demo。'},{status:503});}
}
export async function POST(req:NextRequest){
 const origin=req.headers.get('origin');
 if(!local(req)||(origin&&new URL(origin).host!==req.headers.get('host')))return NextResponse.json({error:'LOCAL_SAME_ORIGIN_ONLY'},{status:403});
 if(Number(req.headers.get('content-length')||0)>250000)return NextResponse.json({error:'PAYLOAD_TOO_LARGE'},{status:413});
 try{
  const raw=await req.text();if(raw.length>250000)return NextResponse.json({error:'PAYLOAD_TOO_LARGE'},{status:413});
  const {action,payload}=JSON.parse(raw);return NextResponse.json(await perform(action,payload),{status:201});
 }catch(error){return NextResponse.json({error:error instanceof ZodError?'字段未完成或确认缺失。未知状态也是有效回答。':'保存未完成。请检查字段、来源物件和存储连接；原封存档案未被改写。'},{status:error instanceof ZodError?400:409});}
}
export async function PATCH(){return NextResponse.json({error:'SEALED_HISTORY_IMMUTABLE'},{status:405});}
export async function DELETE(){return NextResponse.json({error:'SEALED_HISTORY_IMMUTABLE'},{status:405});}
