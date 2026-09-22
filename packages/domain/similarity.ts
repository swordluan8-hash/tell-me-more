import {dimensions} from './catalog';
import {currentDecision, ref, stated, type Features, type HistoricalEvent} from './model';

// Exact lexical overlap: no embeddings, synonym expansion, inferred values or outcome inputs.
export function tokens(text:string):string[]{
 const segments = new Intl.Segmenter('zh',{granularity:'word'}).segment(text.normalize('NFKC').toLowerCase());
 return [...new Set([...segments].filter(s=>s.isWordLike).map(s=>s.segment))].sort();
}
export function currentFeatures(input:unknown,id:string):Features{
 const v=currentDecision.parse(input);
 // A transparent index over user text, not an assertion of inferred roles/goals.
 const mapping={domain:['happened',v.happened],role:['happened',v.happened],goal:['stuck',v.stuck],constraints:['urgency',v.urgency],options:['options',v.options],information:['stuck',v.stuck],social:['happened',v.happened],technology:['happened',v.happened]} as const;
 return Object.fromEntries(dimensions.map(({key})=>[key,stated(mapping[key][1],id,`current.${mapping[key][0]}`)])) as Features;
}
export function compare(features:Features,event:HistoricalEvent){
 const components=dimensions.map(d=>{
  const a=features[d.key], b=event.features[d.key];
  const comparable=a.state==='known'&&b.state==='known'&&!b.provenance.some(p=>p.strength==='AI_INFERENCE');
  const left=comparable?tokens(a.text):[],right=comparable?tokens(b.text):[];
  const matched=left.filter(t=>right.includes(t));
  const union=new Set([...left,...right]).size;
  return {...d,earned:comparable&&union?d.weight*matched.length/union:0,comparable,matched,currentOnly:left.filter(t=>!right.includes(t)),historicalOnly:right.filter(t=>!left.includes(t)),currentSource:a.provenance[0].sourceField,historicalSource:`features.${d.key}`,eventRef:ref(event._id),provenance:b.provenance};
 });
 return {eventRef:ref(event._id),score:Math.round(components.reduce((s,c)=>s+c.earned,0)*100)/100,coverage:components.filter(c=>c.comparable).reduce((s,c)=>s+c.weight,0),components};
}
export function rank(features:Features,events:HistoricalEvent[]){return events.map(e=>compare(features,e)).filter(m=>m.score>0).sort((a,b)=>b.score-a.score||a.eventRef._ref.localeCompare(b.eventRef._ref));}
