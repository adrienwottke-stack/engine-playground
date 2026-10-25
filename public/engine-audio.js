/* Educational pulse synthesis, driven ONLY by snapshots of the running demo model. */
class InlineSixAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frames = [];
    this.gain = 0;
    this.targetGain = 0;
    this.low = 0;
    this.dc = 0;
    this.lastPacketAt = -10;
    this.readSimTime = null;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'volume') this.targetGain = data.muted || !Number.isFinite(data.value) ? 0 : Math.min(1, Math.max(0, data.value));
      if (data.type === 'silence') { this.frames = []; this.readSimTime = null; this.targetGain = 0; }
      if (data.type === 'state') {
        const frame = data.value;
        if (!Number.isFinite(frame.angle) || !Number.isFinite(frame.rpm) || !Number.isFinite(frame.at)) return;
        if (this.frames.length && frame.simTime < this.frames[this.frames.length - 1].simTime) { this.frames = []; this.readSimTime = null; }
        if (this.frames.length && frame.simTime === this.frames[this.frames.length - 1].simTime) { this.frames[this.frames.length - 1] = frame; return; }
        this.frames.push(frame);
        if (this.frames.length > 12) this.frames.shift();
        this.lastPacketAt = currentTime;
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    for (let i = 0; i < out.length; i++) {
      const t = currentTime + i / sampleRate;
      // Sample the MODEL clock at exactly the audio sample rate. Mapping crank
      // angles to arrival timestamps would modulate pitch with browser scheduling.
      const first = this.frames[0], latest = this.frames[this.frames.length - 1];
      if (this.readSimTime === null && first && latest && latest.simTime - first.simTime >= 0.06) this.readSimTime = first.simTime;
      if (this.readSimTime !== null && first && this.readSimTime < first.simTime) this.readSimTime = first.simTime;
      if (this.readSimTime !== null && latest && latest.simTime - this.readSimTime > 0.18) this.readSimTime = latest.simTime - 0.06;
      const readAt = this.readSimTime ?? 0;
      while (this.frames.length > 2 && this.frames[1].simTime <= readAt) this.frames.shift();
      const a = this.frames[0], b = this.frames[1] || a;
      const fresh = t - this.lastPacketAt < 0.25 && this.readSimTime !== null && latest && readAt <= latest.simTime;
      let raw = 0;
      if (a && fresh && !a.paused) {
        const f = a === b ? 0 : Math.max(0, Math.min(1, (readAt - a.simTime) / Math.max(0.001, b.simTime - a.simTime)));
        const rpm = a.rpm + (b.rpm - a.rpm) * f;
        const pedal = a.throttle + (b.throttle - a.throttle) * f;
        let advance = b.angle - a.angle;
        const expected = (a.rpm + b.rpm) / 2 * Math.PI * 2 / 60 * Math.max(0, b.simTime - a.simTime);
        advance += Math.round((expected - advance) / (Math.PI * 4)) * Math.PI * 4;
        const angle = a.angle + advance * f;
        const firing = angle * 3; // 6 firings / 720 degrees = 3 per crank revolution.
        if (rpm > 10) {
          const pulse = 0.48 * Math.sin(firing) + 0.26 * Math.sin(firing * 2 + 0.4) + 0.15 * Math.sin(firing * 3 + 0.9) + 0.09 * Math.sin(firing * 5);
          const mechanical = Math.sin(angle * 6) * 0.05;
          raw = mechanical + (a.ignition ? pulse * (0.2 + 0.8 * pedal) : 0);
          const cutoff = Math.min(6000, 900 + rpm * 0.6 + pedal * 1200);
          const alpha = 1 - Math.exp(-Math.PI * 2 * cutoff / sampleRate);
          this.low += alpha * (raw - this.low);
          raw = Math.tanh(this.low * (1.2 + pedal)) * 0.7;
        }
      }
      this.gain += (this.targetGain - this.gain) * 0.003;
      this.dc += 0.001 * (raw - this.dc);
      out[i] = fresh ? (raw - this.dc) * this.gain : 0;
      if (fresh && !a.paused) this.readSimTime += 1 / sampleRate;
    }
    return true;
  }
}
registerProcessor('inline-six-audio', InlineSixAudio);
