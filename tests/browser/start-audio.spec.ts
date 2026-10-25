import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

test.use({trace:'off',launchOptions:{args:['--autoplay-policy=no-user-gesture-required']}});
const snapshot=(page:Page)=>page.evaluate(()=>{
  const d=(window as any).__playground,s=d.state;
  return {at:Date.now(),mode:d.mode,state:s?{source:s.source,rpm:s.rpm,ignition:s.ignition,starter:s.starter,fuelRateGS:s.fuelRateGS,t:s.t}:null,
    audio:{state:d.audio.state,sampleRate:d.audio.sampleRate,receivedSamples:d.audio.receivedSamples},audioStatus:document.querySelector('#audio-status')?.textContent,
    audioGate:(window as any).__audioGateAudit};
});

test('native Start runs while audio initialization is pending and its delayed rejection cannot undo Stop',async({page},testInfo)=>{
  test.setTimeout(60000);
  const scope='AudioContext and audioWorklet.addModule are injected test doubles; the C++ native motor, native telemetry, and motor commands are real. No audio hardware or actual worklet download is covered.';
  const errors:string[]=[],failures:string[]=[];
  const commands:{at:number;ignition:boolean;starter:boolean}[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>{if(!request.failure()?.errorText.includes('ERR_ABORTED'))failures.push(request.url());});
  page.on('request',request=>{
    if(!request.url().endsWith('/api/core/command'))return;
    try{const command=request.postDataJSON();commands.push({at:Date.now(),ignition:command.ignition,starter:command.starter});}catch{}
  });
  await page.addInitScript(()=>{
    const audit={requestCount:0,requests:[] as {at:number;url:string}[],pendingCount:0,releasedAt:null as number|null,rejections:0,closeCalls:0,lastContextState:'suspended'};
    (window as any).__audioGateAudit=audit;
    let resolveGate:()=>void=()=>{};const gate=new Promise<void>(resolve=>{resolveGate=resolve;});
    (window as any).__releaseAudioGate=()=>{if(audit.releasedAt!==null)return;audit.releasedAt=Date.now();resolveGate();};
    class ControlledAudioContext{
      state:AudioContextState='suspended';sampleRate=44100;baseLatency=.005;outputLatency=0;currentTime=0;
      audioWorklet={addModule:(url:string)=>{
        audit.requestCount++;audit.pendingCount++;audit.requests.push({at:Date.now(),url:String(url)});
        return gate.then(()=>{audit.pendingCount--;audit.rejections++;throw new Error('delayed unavailable audio device');});
      }};
      async close(){this.state='closed';audit.lastContextState='closed';audit.closeCalls++;}
      async resume(){this.state='running';audit.lastContextState='running';}
    }
    window.AudioContext=ControlledAudioContext as unknown as typeof AudioContext;
  });
  await page.goto('/?view=2d#mechanics');
  await expect(page.locator('#connection')).toHaveText('Physischer Kern');
  await expect(page.locator('#engine-canvas')).toBeVisible();await expect(page.locator('#engine-3d-canvas')).toHaveCount(0);
  await page.locator('#reset').click();await expect.poll(async()=>(await snapshot(page)).state?.rpm??Infinity).toBeLessThan(5);
  try{
    await page.locator('#start').click();
    await expect.poll(async()=>(await snapshot(page)).audioGate.requestCount,{timeout:10000}).toBeGreaterThan(0);
    // Beyond the timed starter, the injected audio initialization is still pending.
    await page.waitForTimeout(4800);
    const beforeStop=await snapshot(page);
    await writeFile(testInfo.outputPath('start-audio-before-stop.json'),JSON.stringify({scope,beforeStop,errors,failures,commands},null,2));
    expect(beforeStop.audioGate.releasedAt,'audio initialization is still pending while the engine runs').toBeNull();
    expect(beforeStop.audioGate.pendingCount).toBeGreaterThan(0);expect(beforeStop.audioGate.rejections).toBe(0);
    expect(beforeStop.audioGate.requests[0].url).toContain('/native-audio.js');
    expect(beforeStop.mode).toBe('core');expect(beforeStop.state?.source).toBe('ange-physical');
    expect(beforeStop.state?.ignition).toBe(true);expect(beforeStop.state?.starter).toBe(false);expect(beforeStop.state?.rpm).toBeGreaterThan(700);expect(beforeStop.state?.fuelRateGS).toBeGreaterThan(0);
    await page.locator('#stop').click();await expect.poll(async()=>(await snapshot(page)).state?.ignition).toBe(false);
    const stopped=await snapshot(page),stoppedAt=Date.now();
    expect(stopped.audioGate.releasedAt,'Stop also completes while audio remains pending').toBeNull();expect(stopped.audioGate.pendingCount).toBeGreaterThan(0);
    await page.evaluate(()=>(window as any).__releaseAudioGate());
    await expect(page.locator('#audio-status')).toHaveText('Audiofehler',{timeout:15000});
    await expect.poll(async()=>(await snapshot(page)).audioGate.lastContextState).toBe('closed');
    await expect.poll(async()=>(await snapshot(page)).audioGate.rejections).toBeGreaterThan(0);
    expect((await snapshot(page)).audioGate.closeCalls).toBeGreaterThan(0);
    const afterAudio=[];
    for(let i=0;i<4;i++){
      await page.waitForTimeout(250);const sample=await snapshot(page);afterAudio.push(sample);
      await writeFile(testInfo.outputPath('start-audio-final.json'),JSON.stringify({scope,beforeStop,stopped,afterAudio,errors,failures,commands},null,2));
      expect(sample.state?.ignition,'late audio completion must not issue a new Start').toBe(false);
      expect(sample.state?.starter).toBe(false);
    }
    expect(afterAudio.at(-1)!.state?.t).toBeGreaterThan(stopped.state!.t);
    expect(commands.filter(command=>command.at>=stoppedAt).every(command=>!command.ignition&&!command.starter)).toBe(true);
    await expect(page.locator('#engine-3d-canvas')).toHaveCount(0);
    expect(errors).toEqual([]);expect(failures).toEqual([]);
  }finally{await page.evaluate(()=>(window as any).__releaseAudioGate?.());await page.locator('#stop').click();}
});
