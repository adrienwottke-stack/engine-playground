// Original PCM with a bounded interactive jitter buffer (44.1 kHz mono).
class NativeEnginePcm extends AudioWorkletProcessor {
  constructor(options){super();this.hosted=options?.processorOptions?.hostedRealtime===true;this.ring=new Float32Array(262144);this.write=0;this.read=0;this.started=false;this.gain=0;this.target=0;this.last=-10;
    this.underruns=0;this.droppedSamples=0;this.receivedSamples=0;this.reportAt=0;this.lastValue=0;
    this.startSamples=this.hosted?7056:2646;this.recoveryLimit=this.hosted?7056:4410;this.reserveSamples=this.hosted?3528:1764;this.staleSeconds=this.hosted ? .4 : .15;
    this.targetSamples=this.startSamples;this.maxSamples=this.targetSamples+this.reserveSamples; // 160 ms hosted reserve; no growth into seconds.
    this.markers=[];this.played=null;this.meter=false;this.meterAt=0;this.meterEnergy=0;this.meterCount=0;this.meterPeak=0;
    this.minBuffer=Infinity;this.maxBuffer=0;this.fadeFrom=0;this.fadeRemaining=0;this.energy=0;this.outputSamples=0;
    this.port.onmessage=({data})=>{
      if(data.type==='connect'){this.streamPort?.close();this.streamPort=data.port;this.streamPort.onmessage=({data})=>this.receive(data);}
      else this.receive(data);
    };
  }
  receive(data){
      if(data.type==='volume')this.target=data.muted||!Number.isFinite(data.value)?0:Math.min(1,Math.max(0,data.value));
      if(data.type==='meter')this.meter=data.enabled===true;
      if(data.type==='silence'){this.started=false;this.read=this.write;this.target=0;this.gain=0;this.lastValue=0;this.markers=[];this.played=null;}
      if(data.type==='reset'){this.started=false;this.read=this.write;this.lastValue=0;this.fadeRemaining=0;this.markers=[];this.played=null;this.targetSamples=this.startSamples;this.maxSamples=this.targetSamples+this.reserveSamples;}
      if(data.type==='pcm'){const a=data.samples;if(data.meta)this.markers.push({...data.meta,offset:this.write});for(let i=0;i<a.length;i++)this.ring[(this.write++)%this.ring.length]=a[i];this.receivedSamples+=a.length;this.last=currentTime;if(this.write-this.read>this.maxSamples){this.droppedSamples+=Math.floor(this.write-this.read-this.targetSamples);this.read=this.write-this.targetSamples;this.fadeFrom=this.lastValue;this.fadeRemaining=64;}}
  }
  process(inputs,outputs){const out=outputs[0][0];if(!out)return true;const ratio=44100/sampleRate;
    if(!this.started&&this.write-this.read>=this.targetSamples)this.started=true;
    for(let i=0;i<out.length;i++){this.gain+=(this.target-this.gain)*.003;let value=0;
      if(this.started&&this.write-this.read>2&&currentTime-this.last<this.staleSeconds){
        while(this.markers.length&&this.markers[0].offset<=this.read){const next=this.markers.shift(),changed=next.sequence!==this.played?.sequence;this.played=next;if(changed)this.port.postMessage({type:'played',...next,contextTime:currentTime+i/sampleRate,bufferMs:(this.write-this.read)/44.1});}
        const index=Math.floor(this.read),f=this.read-index;const a=this.ring[index%this.ring.length],b=this.ring[(index+1)%this.ring.length];value=a+(b-a)*f;this.read+=ratio;if(this.fadeRemaining>0){const f=this.fadeRemaining--/64;value=value*(1-f)+this.fadeFrom*f;}this.lastValue=value;}
      else {if(this.started){this.started=false;if(this.target>0){this.underruns++;this.targetSamples=Math.min(this.recoveryLimit,this.targetSamples+882);this.maxSamples=this.targetSamples+this.reserveSamples;}if(currentTime-this.last>=this.staleSeconds)this.read=this.write;}this.lastValue*=.97;value=this.lastValue;}
      out[i]=Math.max(-1,Math.min(1,value))*this.gain;
      this.energy+=out[i]*out[i];this.outputSamples++;
      if(this.meter){this.meterEnergy+=out[i]*out[i];this.meterCount++;this.meterPeak=Math.max(this.meterPeak,Math.abs(out[i]));}
    }
    const bufferMs=Math.max(0,this.write-this.read)/44.1;
    if(this.started){this.minBuffer=Math.min(this.minBuffer,bufferMs);this.maxBuffer=Math.max(this.maxBuffer,bufferMs);}
    if(this.meter&&currentTime>=this.meterAt){this.meterAt=currentTime+.02;this.port.postMessage({type:'meter',contextTime:currentTime+out.length/sampleRate,rms:Math.sqrt(this.meterEnergy/Math.max(1,this.meterCount)),peak:this.meterPeak,sequence:this.played?.sequence??0,throttle:this.played?.throttle??0,rpm:this.played?.rpm??0,bufferMs});this.meterEnergy=0;this.meterCount=0;this.meterPeak=0;}
    if(currentTime>=this.reportAt){this.reportAt=currentTime+.5;this.port.postMessage({type:'stats',underruns:this.underruns,droppedSamples:this.droppedSamples,receivedSamples:this.receivedSamples,bufferMs,minBufferMs:Number.isFinite(this.minBuffer)?this.minBuffer:0,maxBufferMs:this.maxBuffer,targetBufferMs:this.targetSamples/44.1,audibleSequence:this.played?.sequence??0,audibleThrottle:this.played?.throttle??0,rms:Math.sqrt(this.energy/Math.max(1,this.outputSamples))});this.minBuffer=Infinity;this.maxBuffer=0;this.energy=0;this.outputSamples=0;}
    return true;
  }
}
registerProcessor('native-engine-pcm',NativeEnginePcm);
