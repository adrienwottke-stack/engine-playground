import './tuning-panel.css';
import {DEFAULT_TUNING,validateTuning,tuningParameters,tuningRequirements,completeTuningSupport,type TuningSelection} from '../native/tuning-settings.mjs';
import {previewTuningCurve,sameTuning,validateMeasuredComparison,tuningTraits,type MeasuredTuningComparison,type TuningCurvePoint} from './tuning-model';
import {TUNING_CATALOG,TUNING_GROUPS,choosePart,type PartKey} from './tuning-catalog';
export type {TuningSelection,MeasuredTuningComparison,TuningCurvePoint};
export interface TuningPanel{getSelection():TuningSelection;getAppliedSelection():TuningSelection;setApplied(selection:unknown):void;setEngineRunning(running:boolean):void;setMeasuredComparison(data:MeasuredTuningComparison|null):void;destroy():void}
export interface TuningPanelOptions{initialSelection?:unknown;onApply(selection:TuningSelection):Promise<void>}
const escape=(s:string)=>s.replace(/[&<>"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x]!));
const signed=(v:number,suffix='')=>`${v>0?'+':''}${Math.round(v)}${suffix}`;
function chartMarkup(a:TuningCurvePoint[],b:TuningCurvePoint[],metric:'torqueNm'|'powerKw',small=false){
 const width=small?330:720,height=small?140:190,left=40,right=width-15,top=20,bottom=height-30;
 const max=Math.max(1,...a.map(p=>p[metric]),...b.map(p=>p[metric]));
 const maxRpm=Math.max(a.at(-1)!.rpm,b.at(-1)!.rpm),minRpm=Math.min(a[0].rpm,b[0].rpm);
 const x=(rpm:number)=>left+(rpm-minRpm)/(maxRpm-minRpm)*(right-left),y=(v:number)=>bottom-v/(max*1.1)*(bottom-top);
 const path=(rows:TuningCurvePoint[])=>rows.map((p,i)=>`${i?'L':'M'}${x(p.rpm).toFixed(1)},${y(p[metric]).toFixed(1)}`).join(' ');
 let markup=`<text x="${left}" y="12">${metric==='torqueNm'?'Nm':'kW'}</text>`;
 for(let i=0;i<3;i++){const v=max*i/2;markup+=`<path class="tuning-grid" d="M${left} ${y(v)}H${right}"/><text x="${left-6}" y="${y(v)+3}" text-anchor="end">${Math.round(v)}</text>`;}
 for(let i=0;i<4;i++){const rpm=minRpm+(maxRpm-minRpm)*i/3;markup+=`<text x="${x(rpm)}" y="${height-13}" text-anchor="middle">${Math.round(rpm/100)*100}</text>`;}
 return {viewBox:`0 0 ${width} ${height}`,markup:`${markup}<path class="tuning-baseline" d="${path(a)}"/><path class="tuning-selected" d="${path(b)}"/><text x="${right}" y="${height}" text-anchor="end">U/min</text>`};
}
export function installTuningPanel(container:HTMLElement,options:TuningPanelOptions):TuningPanel{
 let applied=validateTuning(options.initialSelection),selection=validateTuning(applied),busy=false,running=false,destroyed=false,error='',success='';
 let group=TUNING_GROUPS[0],metric:'torqueNm'|'powerKw'='torqueNm',measured:MeasuredTuningComparison|null=null;
 let viewed:{key:PartKey;value:string}={key:'camshaft',value:'sport'};
 const root=document.createElement('section');root.className='tuning-workshop';root.setAttribute('aria-label','Tuning-Werkstatt');
 root.innerHTML=`<div class="tuning-heading"><div><span class="tuning-eyebrow">M54B30 · SAUGER-WERKSTATT</span><h2>Dein Motor. Deine Teile.</h2><p>Teil ansehen, Wirkung verstehen, Aufbau zusammenstellen.</p></div><span class="tuning-installed" data-installed></span></div>
 <div class="tuning-build-stats" data-build-stats aria-label="Dein Aufbau im Vergleich zur Serie"></div><p class="tuning-score-note">Modellvorschau · Charakterbalken sind relative Spielwerte, keine Fahrzeugmessung.</p>
 <div class="tuning-tabs" role="tablist" aria-label="Teilegruppen">${TUNING_GROUPS.map((name,i)=>`<button type="button" role="tab" id="tuning-tab-${i}" aria-controls="tuning-parts-grid" data-group="${i}" aria-selected="${i===0}" tabindex="${i===0?0:-1}">${name}<span>${TUNING_CATALOG.filter(p=>p.group===name).length}</span></button>`).join('')}</div>
 <div class="tuning-body"><div class="tuning-parts" id="tuning-parts-grid" role="tabpanel" aria-labelledby="tuning-tab-0"></div>
 <aside class="tuning-effect" aria-label="Wirkung des betrachteten Teils"><div class="tuning-effect-kicker" data-effect-kicker></div><h3 data-effect-name></h3><p class="tuning-effect-description" data-effect-description></p><div class="tuning-effect-tradeoffs" data-tradeoffs></div><div class="tuning-mini-title">So verändert sich die Kurve <span>geschätzt</span></div><svg class="tuning-mini-chart" data-mini-chart role="img" aria-label="Geschätzte Wirkung des betrachteten Teils"></svg><div class="tuning-curve-legend"><span>Aktuelle Auswahl</span><span>Mit diesem Teil</span></div><div class="tuning-traits" data-traits></div><p class="tuning-effect-help">Hover oder Tastaturfokus zeigt die Wirkung. Klicken oder Antippen wählt das Teil.</p></aside></div>
 <div class="tuning-fitment" data-fitment role="status"></div><button type="button" data-support class="tuning-support" hidden>Passende Stützteile ergänzen</button>
 <div class="tuning-bottom"><p data-selection-count></p><div class="tuning-actions"><button type="button" data-reset class="tuning-reset">Zur Serie</button><button type="button" data-apply class="tuning-apply">Teile einbauen</button></div></div><p class="tuning-status" data-status role="status" aria-live="polite"></p>
 <details class="tuning-comparison" open><summary>Dein Aufbau im Kurvenvergleich <span data-curve-source>Modellvorschau · geschätzt</span></summary><div class="tuning-curve-toolbar"><div class="tuning-curve-switch" aria-label="Kurve"><button type="button" data-metric="torqueNm" aria-pressed="true">Drehmoment</button><button type="button" data-metric="powerKw" aria-pressed="false">Leistung</button></div><div class="tuning-curve-legend"><span>Serie</span><span>Dein Aufbau</span></div></div><svg class="tuning-chart" data-chart role="img"></svg><p class="tuning-curve-note" data-curve-note></p></details>
 <details class="tuning-method"><summary>Was wird tatsächlich simuliert?</summary><p>Teile verändern Durchfluss, Nockenhub und Öffnungsdauer, feste Nockenphasen, Verdichtung, bewegte Massen, Zündwinkel, Gemisch, Ansaugvolumina und den nativen Zündungsbegrenzer. Einzeldrosseln erhalten sechs getrennte Ansaugvolumina.</p><p>Federn, Federteller und Ventiltrieb bestimmen die zulässige Kombination im Modell. Ventilflattern, Festigkeit und Klopfgrenzen werden nicht berechnet. Der Leerlaufaufbau verändert die Grundöffnung; er garantiert keine feste Leerlaufdrehzahl.</p><p>Die Kurven sind eine unkalibrierte Schätzung aus 2,979 Litern Hubraum, angenommenem Arbeitsdruck, Durchlass, Nocken, Verdichtung und Abstimmung. Keine gemessenen BMW- oder Teileherstellerwerte. Das Schwungrad ändert die Reaktion, nicht die stationäre Leistung. Die Charakterbalken sind relative Spielwerte.</p></details>`;
 container.append(root);
 const el=<T extends HTMLElement|SVGElement=HTMLElement>(s:string)=>root.querySelector<T>(s)!;
 const effect=el('.tuning-effect');
 const count=(t:TuningSelection)=>Object.keys(DEFAULT_TUNING).filter(k=>t[k as PartKey]!==DEFAULT_TUNING[k as PartKey]).length;
 function renderParts(){
  el('.tuning-body').append(effect);
  const i=TUNING_GROUPS.indexOf(group);el('.tuning-parts').setAttribute('aria-labelledby',`tuning-tab-${i}`);
  root.querySelectorAll<HTMLButtonElement>('[data-group]').forEach(b=>{const active=Number(b.dataset.group)===i;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
  el('.tuning-parts').innerHTML=TUNING_CATALOG.filter(p=>p.group===group).map(slot=>`<section class="tuning-part-slot"><h3>${slot.name}<span data-slot-state="${slot.key}"></span></h3><div class="tuning-options" role="group" aria-label="${slot.name}">${slot.options.map(part=>`<button type="button" class="tuning-option" data-part="${slot.key}" data-value="${part.value}" aria-pressed="false" aria-label="${part.name}" aria-describedby="tuning-hover-hint"><span>${part.name}</span><small>${part.value==='standard'||part.value==='auto'?'Original / Basis':'Einbauteil'}</small><b aria-hidden="true">+</b></button>`).join('')}</div></section>`).join('')+'<p id="tuning-hover-hint" class="tuning-list-hint">Teil ansehen → Wirkung rechts · Antippen zum Auswählen</p>';
 }
 function renderEffect(){
  if(destroyed)return;
  const slot=TUNING_CATALOG.find(p=>p.key===viewed.key)!,part=slot.options.find(p=>p.value===viewed.value)!;
  const current=selection[viewed.key]===viewed.value?choosePart(selection,viewed.key,DEFAULT_TUNING[viewed.key]):selection;
  const candidate=choosePart(selection,viewed.key,viewed.value),before=tuningTraits(current),after=tuningTraits(candidate);
  el('[data-effect-kicker]').textContent=selection[viewed.key]!==viewed.value?'TEILEVORSCHAU · NOCH NICHT AUSGEWÄHLT':'TEIL IN DEINER AUSWAHL';
  el('[data-effect-name]').textContent=part.name;el('[data-effect-description]').textContent=part.description;
  el('[data-tradeoffs]').innerHTML=`<span class="tuning-plus">+ ${escape(part.plus)}</span>${part.minus?`<span class="tuning-minus">− ${escape(part.minus)}</span>`:''}`;
  const chart=chartMarkup(previewTuningCurve(current),previewTuningCurve(candidate),'torqueNm',true),svg=el<SVGSVGElement>('[data-mini-chart]');svg.setAttribute('viewBox',chart.viewBox);svg.innerHTML=chart.markup;
  const traits=[['power','Leistung'],['response','Drehzahlreaktion'],['lowEnd','Zug untenrum'],['highRpm','Drehzahlpotenzial'],['comfort','Komfort']] as const;
  el('[data-traits]').innerHTML=traits.map(([key,label])=>{const change=Math.round(after[key]-before[key]),tone=change>0?'positive':change<0?'negative':'neutral';return `<div class="tuning-trait"><div><span>${label}</span><strong class="${tone}">${change===0?'±0':signed(change)}</strong></div><div class="tuning-trait-track" role="meter" aria-label="${label}: ${Math.round(after[key])} von 100 Spielpunkten, Änderung ${signed(change)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(after[key])}"><i style="width:${before[key]}%"></i><b class="${tone}" style="width:${after[key]}%"></b></div></div>`;}).join('');
  const viewedButton=root.querySelector(`[data-part="${viewed.key}"][data-value="${viewed.value}"]`);
  if(matchMedia('(max-width:650px)').matches&&viewedButton)viewedButton.closest('.tuning-part-slot')!.after(effect);
  else el('.tuning-body').append(effect);
 }
 function render(){
  const changed=!sameTuning(selection,applied),n=count(selection),installed=count(applied),p=tuningParameters(selection),missing=tuningRequirements(selection);
  root.dataset.pending=String(changed);root.setAttribute('aria-busy',String(busy));
  root.querySelectorAll<HTMLButtonElement>('[data-part]').forEach(b=>b.setAttribute('aria-pressed',String(selection[b.dataset.part as PartKey]===b.dataset.value)));
  root.querySelectorAll<HTMLElement>('[data-slot-state]').forEach(node=>{const key=node.dataset.slotState as PartKey;node.textContent=selection[key]===DEFAULT_TUNING[key]?'':'geändert';});
  root.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=busy);
  const apply=el<HTMLButtonElement>('[data-apply]');apply.disabled=busy||!changed||missing.length>0;apply.textContent=busy?'Wird eingebaut …':running&&changed?'Motor stoppen & einbauen':'Teile einbauen';
  el<HTMLButtonElement>('[data-reset]').disabled=busy||(!changed&&installed===0);
  el('[data-installed]').textContent=installed?`${installed} Teile / Einstellungen eingebaut`:'Serie eingebaut';
  el('[data-selection-count]').textContent=`${n} Änderungen ${changed?'vorgemerkt':'im Aufbau'} · ${p.redlineRpm.toLocaleString('de-DE')} U/min freigegeben`;
  const capped=p.requestedRedlineRpm>p.redlineRpm;
  el('[data-fitment]').textContent=missing.length?'Für diese Kombination erforderlich: '+missing.map(x=>x.label).join(', ')+'.':capped?`Der aktuelle Ventiltrieb begrenzt auf ${p.redlineRpm.toLocaleString('de-DE')} U/min. Mit passenden Stützteilen sind im Modell ${p.requestedRedlineRpm.toLocaleString('de-DE')} U/min möglich.`:'Teile passen im vereinfachten Werkstattmodell zusammen.';
  el('[data-fitment]').dataset.warning=String(missing.length>0||capped);el<HTMLButtonElement>('[data-support]').hidden=missing.length===0&&!capped;
  el('[data-status]').dataset.error=String(!!error);el('[data-status]').textContent=error||(busy?'Motor wird gestoppt. Der Einbau wartet auf frische Bestätigung aus dem Motorkern.':changed?'Vorgemerkt – noch nicht eingebaut. Kurven und Spielwerte zeigen deine Auswahl.':success||'Wähle eine Teilegruppe und stelle deinen Motor zusammen.');
  const base=tuningTraits(),build=tuningTraits(selection),gain=(build.powerKw/base.powerKw-1)*100;
  el('[data-build-stats]').innerHTML=`<div><span>Leistung · geschätzt</span><strong class="${gain>0?'positive':gain<0?'negative':''}">${signed(gain,'%')}</strong></div><div><span>Drehzahlgrenze</span><strong>${build.redlineRpm.toLocaleString('de-DE')} <small>U/min</small></strong></div><div><span>Drehzahlreaktion</span><strong class="${build.response>=base.response?'positive':'negative'}">${signed(build.response-base.response)} <small>Pkt.</small></strong></div><div><span>Komfort</span><strong class="${build.comfort>=base.comfort?'positive':'negative'}">${signed(build.comfort-base.comfort)} <small>Pkt.</small></strong></div>`;
  const actual=measured&&sameTuning(measured.selection,selection)?measured:null;
  const chart=chartMarkup(actual?.baseline??previewTuningCurve(),actual?.selected??previewTuningCurve(selection),metric),svg=el<SVGSVGElement>('[data-chart]');svg.setAttribute('viewBox',chart.viewBox);svg.setAttribute('aria-label',`${actual?'Native Messkurven':'Geschätzte Modellvorschau'} ${metric==='torqueNm'?'Drehmoment in Nm':'Leistung in kW'}, grau Serie, orange Aufbau.`);svg.innerHTML=chart.markup;
  el('[data-curve-source]').textContent=actual?'Native Messkurven':'Modellvorschau · geschätzt';el('[data-curve-note]').textContent=actual?.sourceLabel??'Geschätzter Vollgasverlauf. Keine native Prüfstandsmessung und keine zugesicherte Mehrleistung.';
  root.querySelectorAll<HTMLButtonElement>('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.metric===metric)));
  renderEffect();
 }
 async function applySelection(){
  if(busy||sameTuning(selection,applied)||tuningRequirements(selection).length)return;
  const requested=validateTuning(selection);busy=true;error='';success='';render();
  try{await options.onApply(requested);if(destroyed)return;applied=requested;success=count(applied)?'Teile eingebaut und bestätigt. Starte den Motor.':'Serie ist wieder eingebaut.';}
  catch(reason){if(destroyed)return;error=`Einbau nicht bestätigt. ${reason instanceof Error?reason.message:'Bitte erneut versuchen.'}`;}
  finally{if(!destroyed){busy=false;render();}}
 }
 function inspect(event:Event){const b=(event.target as Element).closest<HTMLElement>('[data-part]');if(!b||busy)return;viewed={key:b.dataset.part as PartKey,value:b.dataset.value!};renderEffect();}
 function click(event:Event){
  const b=(event.target as Element).closest<HTMLButtonElement>('button');if(!b||busy)return;
  if(b.dataset.group!==undefined){group=TUNING_GROUPS[Number(b.dataset.group)];renderParts();render();}
  else if(b.dataset.part){selection=choosePart(selection,b.dataset.part as PartKey,b.dataset.value!);viewed={key:b.dataset.part as PartKey,value:b.dataset.value!};error='';success='';render();}
  else if(b.hasAttribute('data-support')){selection=completeTuningSupport(selection);error='';render();}
  else if(b.dataset.metric){metric=b.dataset.metric as typeof metric;render();}
  else if(b.hasAttribute('data-apply'))void applySelection();
  else if(b.hasAttribute('data-reset')){selection=validateTuning();error='';render();void applySelection();}
 }
 function keydown(event:KeyboardEvent){
  const b=(event.target as Element).closest<HTMLButtonElement>('[data-group]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const old=Number(b.dataset.group),i=event.key==='Home'?0:event.key==='End'?TUNING_GROUPS.length-1:(old+(event.key==='ArrowRight'?1:-1)+TUNING_GROUPS.length)%TUNING_GROUPS.length;
  group=TUNING_GROUPS[i];renderParts();render();el<HTMLButtonElement>(`[data-group="${i}"]`).focus();
 }
 root.addEventListener('click',click);root.addEventListener('pointerover',inspect);root.addEventListener('focusin',inspect);root.addEventListener('keydown',keydown);renderParts();render();
 return{getSelection:()=>validateTuning(selection),getAppliedSelection:()=>validateTuning(applied),setApplied(value){const follow=sameTuning(selection,applied);applied=validateTuning(value);if(follow)selection=validateTuning(applied);if(!busy)render();},setEngineRunning(value){if(running!==value){running=value;render();}},setMeasuredComparison(data){measured=data?validateMeasuredComparison(data):null;render();},destroy(){destroyed=true;root.removeEventListener('click',click);root.removeEventListener('pointerover',inspect);root.removeEventListener('focusin',inspect);root.removeEventListener('keydown',keydown);root.remove();}};
}
