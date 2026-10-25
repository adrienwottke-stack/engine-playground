import {DEFAULT_SOUND,validateSound,type SoundSettings} from '../native/reference-settings.mjs';
import type {EngineAudio} from './audio';
import type {Config} from './model';
import type {ViewState} from './drawing';
import './sound-panel.css';
export function installSoundPanel(options:{config:()=>Config;state:()=>ViewState|null;mode:()=>string;audio:EngineAudio;change:(s:SoundSettings)=>void}) {
  const panel=document.createElement('section');panel.className='sound-panel';panel.setAttribute('aria-label','Auspuffklang');
  panel.innerHTML=`<h2>KLANG</h2><label>Auspuffklang<select id="exhaust-ir"><option value="default_0">Original · Smooth 39</option><option value="sharp_0">Sharp · offen</option><option value="mild_exhaust_0">Mild · gedämpft</option><option value="mild_exhaust_0_reverb">Mild · mit Nachklang</option><option value="minimal_muffling_01">Wenig Dämpfung</option></select></label>
  <details class="sound-details"><summary>Klang abstimmen</summary><div class="sound-sliders">${[['hfGain','Höhen / Druckänderung',.03,.0001],['noise','Strömungsrauigkeit',1,.01],['jitter','Zeitliche Unruhe',1,.01],['convolution','Auspuff-Filteranteil',1,.01]].map(([key,title,max,step])=>`<label>${title}<output data-sound-output="${key}"></output><input type="range" aria-label="${title}" data-sound="${key}" min="0" max="${max}" step="${step}"/></label>`).join('')}</div><label class="sound-check"><input id="idle-assist" type="checkbox"/>Zusätzlicher Leerlaufregler</label><button id="sound-reset">Originalklang wiederherstellen</button><p class="sound-help">Regler wirken während des Laufs. Ein anderer Auspuff lädt den Motor neu.</p><output id="sound-health" role="status">Audio bereit · Motor starten</output></details>`;
  document.querySelector('.gear-control')!.after(panel);
  const ir=panel.querySelector<HTMLSelectElement>('#exhaust-ir')!,idle=panel.querySelector<HTMLInputElement>('#idle-assist')!,sliders=Array.from(panel.querySelectorAll<HTMLInputElement>('[data-sound]'));
  function refresh(){
    const s=validateSound(options.config().sound);ir.value=s.impulse;idle.checked=s.idleAssist;
    for(const input of sliders){const key=input.dataset.sound as 'hfGain';input.value=String(s[key]);panel.querySelector<HTMLOutputElement>(`[data-sound-output="${key}"]`)!.value=Number(s[key]).toLocaleString('de-DE',{maximumFractionDigits:4});}
    for(const path of ['boreMm','strokeMm','rodMm','flywheelKgM2'])document.querySelectorAll<HTMLInputElement>(`[data-cfg="engine.${path}"]`).forEach(input=>{input.disabled=true;input.title='Motorgeometrie des M54B30';});
    for(const control of [ir,idle,...sliders])control.disabled=options.mode()!=='core';
  }
  function update(patch:Partial<SoundSettings>){options.change(validateSound({...options.config().sound,...patch,preset:'m54'}));refresh();}
  ir.addEventListener('change',()=>update({impulse:ir.value}));idle.addEventListener('change',()=>update({idleAssist:idle.checked}));
  for(const input of sliders)input.addEventListener('input',()=>update({[input.dataset.sound!]:Number(input.value)}));
  panel.querySelector('#sound-reset')!.addEventListener('click',()=>update({...DEFAULT_SOUND}));
  let previous='';window.setInterval(()=>{if(!panel.querySelector('details')!.open)return;const state=options.state(),a=options.audio.stats;const text=options.audio.context?.state==='running'?`${state?.simulationHz?.toLocaleString('de-DE')??'—'} Schritte/s · Puffer ${Math.round(a.bufferMs)} ms · Aussetzer ${a.underruns}`:'Audio bereit · Motor starten';if(text!==previous){panel.querySelector('#sound-health')!.textContent=text;previous=text;}},500);
  refresh();return {refresh};
}
