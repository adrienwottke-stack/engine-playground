import type { State } from './model';

export class EngineAudio {
  context: AudioContext | null = null;
  node: AudioWorkletNode | null = null;
  analyser: AnalyserNode | null = null;
  volume = 0.5;
  muted = false;
  private pending: Promise<void> | null = null;
  source: 'demo' | 'core' = 'demo';
  private stream: Worker | null = null;
  stats = { underruns: 0, droppedSamples: 0, receivedSamples: 0, bufferMs: 0 };
  async enable(source: 'demo' | 'core' = 'demo', simulationHz = 10000) {
    if (this.pending) return this.pending;
    this.pending = this.initialize(source, simulationHz).finally(() => { this.pending = null; });
    return this.pending;
  }
  private async initialize(source: 'demo' | 'core', simulationHz: number) {
    if(this.context && this.source!==source){this.disconnect();this.node?.disconnect();await this.context.close();this.context=null;this.node=null;this.analyser=null;}
    this.source=source;
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      try {
        await this.context.audioWorklet.addModule(source==='core'?'/native-audio.js?v=0.4.8':'/engine-audio.js?v=0.4.6');
        this.node = new AudioWorkletNode(this.context, source==='core'?'native-engine-pcm':'inline-six-audio', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { hostedRealtime: source==='core' && ((simulationHz>0 && simulationHz<10000) || document.documentElement.dataset.hostedAudio==='true') } });
        this.stats = { underruns: 0, droppedSamples: 0, receivedSamples: 0, bufferMs: 0 };
        this.node.port.onmessage = ({data}) => {
          if (data.type !== 'stats') return;
          this.stats = data;
          const root = document.getElementById('app')!;
          root.dataset.audioUnderruns=String(data.underruns);
          root.dataset.audioDroppedSamples=String(data.droppedSamples);
          root.dataset.audioReceivedSamples=String(data.receivedSamples);
          root.dataset.audioBufferMs=Number(data.bufferMs).toFixed(1);
          root.dataset.audioMinBufferMs=Number(data.minBufferMs ?? 0).toFixed(1);
          root.dataset.audioMaxBufferMs=Number(data.maxBufferMs ?? 0).toFixed(1);
          root.dataset.audioTargetBufferMs=String(data.targetBufferMs ?? '');
          root.dataset.audioRms=Number(data.rms??0).toFixed(6);
        };
        this.node.connect(this.context.destination);
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 8192;
        this.node.connect(this.analyser);
      } catch (error) { await this.context.close(); this.context = null; throw error; }
    }
    await this.context.resume();
    this.setVolume(this.volume, this.muted);
    if(source==='core'&&!this.stream){
      const stream=new Worker('/native-stream.js?v=0.3.1'), channel=new MessageChannel();this.stream=stream;
      this.node!.port.postMessage({type:'connect',port:channel.port1},[channel.port1]);
      stream.postMessage({type:'connect',port:channel.port2},[channel.port2]);
      stream.onmessage=({data})=>{const root=document.getElementById('app')!;if(data.type==='stream')root.dataset.audioStreamConnected=String(data.connected);if(data.type==='timing')root.dataset.audioPacketGapMs=Number(data.maxPacketGapMs).toFixed(1);};
      stream.onerror=()=>{if(this.stream===stream){this.silence();stream.terminate();this.stream=null;}};
    }
    const root=document.getElementById('app')!;
    root.dataset.audioBaseLatencyMs=(this.context.baseLatency*1000).toFixed(1);
    root.dataset.audioOutputLatencyMs=((this.context.outputLatency??0)*1000).toFixed(1);
  }
  setVolume(volume: number, muted = this.muted) {
    this.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
    this.muted = muted;
    this.node?.port.postMessage({ type: 'volume', value: this.volume, muted });
  }
  update(state: State) {
    if(this.source==='core')return;
    if (!this.context || !this.node) return;
    this.node.port.postMessage({ type: 'state', value: { at: this.context.currentTime, simTime: state.t, angle: state.crankAngle, rpm: state.rpm, throttle: state.actualThrottle, ignition: state.ignition, paused: state.simPaused } });
  }
  silence() { this.node?.port.postMessage({ type: 'silence' }); }
  disconnect(){this.stream?.terminate();this.stream=null;this.silence();}
  signal() {
    if (!this.analyser || !this.context) return { rms: 0, dominantHz: 0 };
    const wave = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(wave);
    const rms = Math.sqrt(wave.reduce((sum, x) => sum + x * x, 0) / wave.length);
    const bins = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatFrequencyData(bins);
    let peak = 1;
    for (let i = 2; i < bins.length; i++) if (bins[i] > bins[peak]) peak = i;
    return { rms, dominantHz: rms > 1e-7 ? peak * this.context.sampleRate / this.analyser.fftSize : 0 };
  }
}
