import {createReadStream} from 'node:fs';
import {readdir,mkdir,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sessions='C:/Users/demo/.codex/sessions/2026/10/25';
const targets=[
  ['01a17384-e8b9-7793-bab6-e731fdc52390','Block/Kopf'],
  ['01a17385-3933-7912-8462-78041e0ef97c','Ansaugung'],
  ['01a17385-907e-79b2-a5d0-c4f3f1481941','Kruemmer'],
  ['01a17386-07fe-73b2-967a-952c704b93bd','Oberflaechen/Licht'],
  ['01a1745b-5cbc-7332-ad3a-94144d29f20b','Flussansicht'],
  ['01a1745c-fa86-7ad1-9846-d78b5a4cbfbf','M54-Klang'],
  ['01a173c6-279f-7772-85b8-6f9544474808','Latenz/Bedienkanal'],
  ['01a17463-f0ee-7fc1-9c28-d0cb0e7a8291','CPU-A/B'],
  ['01a17422-1902-7840-b5aa-a0443d9eae0d','Orchestrator'],
];
const label=process.argv[2]||'snapshot',names=await readdir(sessions),chats=[];
for(const [id,role]of targets){
  const name=names.find(name=>name.endsWith(id+'.jsonl'));
  if(!name){chats.push({id,role,missing:true});continue;}
  let lastUsage=null,turnRecords=0,malformedLines=0;
  const models=new Set(),compactions=[];
  for await(const line of createInterface({input:createReadStream(resolve(sessions,name)),crlfDelay:Infinity})){
    let record;try{record=JSON.parse(line);}catch{malformedLines++;continue;}
    const p=record.payload??{};
    if(record.type==='turn_context'){turnRecords++;if(p.model)models.add(p.model);}
    const itemType=p.item?.type??p.type??'';
    if(record.type==='compacted'||/compac/i.test(String(itemType)))compactions.push({at:record.timestamp,record:record.type,itemType});
    if(record.type==='event_msg'&&p.type==='token_count'&&p.info){
      const usage=p.info.last_token_usage??{};
      lastUsage={at:record.timestamp,inputTokens:usage.input_tokens??null,cachedInputTokens:usage.cached_input_tokens??null,outputTokens:usage.output_tokens??null,window:p.info.model_context_window??null};
    }
  }
  const inputFraction=lastUsage?.window&&typeof lastUsage.inputTokens==='number'?lastUsage.inputTokens/lastUsage.window:null;
  chats.push({id,role,log:resolve(sessions,name),turnRecords,malformedLines,models:[...models],compactions,lastUsage,inputPercent:inputFraction===null?null:Math.round(inputFraction*1000)/10});
}
const report={createdAt:new Date().toISOString(),label,scope:'Only selected chat logs; usage/record metadata. No messages, prompts, reasoning content, credentials or settings modified.',limitations:'Last recorded request input divided by the reported window, not a live composer percentage, quality score, exact remaining capacity or cumulative account usage. Compaction count covers explicit local markers only. No native compaction, model switch, restart or new chat is performed.',chats};
const output=resolve(root,'evidence/context-audit-20261025');await mkdir(output,{recursive:true});
await writeFile(resolve(output,label+'.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({path:resolve(output,label+'.json'),chats:chats.map(c=>({id:c.id,role:c.role,inputPercent:c.inputPercent,input:c.lastUsage?.inputTokens,window:c.lastUsage?.window,models:c.models,compactionMarkers:c.compactions?.length}))}));
