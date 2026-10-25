// Round 2: causal EQ of the computed PCM, following Adrien's "too muffled" feedback.
// No oscillators, added noise, sample playback, look-ahead, or block buffering.
// Parameters are a listening candidate, NOT an OEM transfer-function calibration.
export const M54_R6_PRESENCE = Object.freeze([
  Object.freeze({ type: 'lowShelf', hz: 180, gainDb: -4, slope: 1 }),
  Object.freeze({ type: 'peak', hz: 400, gainDb: -5, q: 1 }),
  Object.freeze({ type: 'peak', hz: 1150, gainDb: 9, q: .75 }),
  Object.freeze({ type: 'highShelf', hz: 2000, gainDb: 4, slope: 1 }),
]);

// RBJ / W3C Audio EQ Cookbook coefficients, normalized to a0=1.
export function presenceCoefficients(spec, sampleRate) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw Error('Unsupported sample rate');
  const { type, hz, gainDb } = spec;
  if (!(hz > 0 && hz < sampleRate/2) || !Number.isFinite(gainDb) || Math.abs(gainDb) > 24) throw Error('Invalid EQ parameters');
  const A = 10 ** (gainDb/40), w = 2*Math.PI*hz/sampleRate, c = Math.cos(w), s = Math.sin(w);
  let b0,b1,b2,a0,a1,a2;
  if (type === 'peak') {
    if (!(spec.q > 0)) throw Error('Positive Q required');
    const alpha = s/(2*spec.q);
    [b0,b1,b2,a0,a1,a2] = [1+alpha*A,-2*c,1-alpha*A,1+alpha/A,-2*c,1-alpha/A];
  } else if (type === 'lowShelf' || type === 'highShelf') {
    if (!(spec.slope > 0 && spec.slope <= 1)) throw Error('Shelf slope must be in (0,1]');
    const alpha = s/2*Math.sqrt((A+1/A)*(1/spec.slope-1)+2), t = 2*Math.sqrt(A)*alpha;
    if (type === 'lowShelf') {
      [b0,b1,b2,a0,a1,a2] = [A*((A+1)-(A-1)*c+t),2*A*((A-1)-(A+1)*c),A*((A+1)-(A-1)*c-t),
        (A+1)+(A-1)*c+t,-2*((A-1)+(A+1)*c),(A+1)+(A-1)*c-t];
    } else {
      [b0,b1,b2,a0,a1,a2] = [A*((A+1)+(A-1)*c+t),-2*A*((A-1)+(A+1)*c),A*((A+1)+(A-1)*c-t),
        (A+1)-(A-1)*c+t,2*((A-1)-(A+1)*c),(A+1)-(A-1)*c-t];
    }
  } else throw Error('Unsupported EQ type');
  return Object.freeze([b0/a0,b1/a0,b2/a0,a1/a0,a2/a0]);
}

export class M54Presence {
  constructor(sampleRate = 44100, specs = M54_R6_PRESENCE) {
    this.sampleRate = sampleRate;
    this.stages = specs.map(spec => ({ coefficients:presenceCoefficients(spec,sampleRate), z1:0,z2:0 }));
  }
  reset() { for(const stage of this.stages) stage.z1=stage.z2=0; }
  process(sample) {
    let x = Number.isFinite(sample) ? sample : 0;
    for(const stage of this.stages) {
      const [b0,b1,b2,a1,a2] = stage.coefficients;
      const y=b0*x+stage.z1;
      stage.z1=b1*x-a1*y+stage.z2;
      stage.z2=b2*x-a2*y;
      // Ignore inaudible IIR subnormal tails on the local audio thread.
      if(Math.abs(stage.z1)<1e-20)stage.z1=0;
      if(Math.abs(stage.z2)<1e-20)stage.z2=0;
      x=y;
    }
    return x;
  }
  processBlock(input, output = new Float64Array(input.length)) {
    if (output.length !== input.length) throw Error('Output size differs');
    for(let i=0;i<input.length;i++)output[i]=this.process(input[i]);
    return output;
  }
  responseDb(hz) {
    const w = 2*Math.PI*hz/this.sampleRate, c=Math.cos(w),s=Math.sin(w),c2=Math.cos(2*w),s2=Math.sin(2*w);
    let db=0;
    for(const {coefficients:[b0,b1,b2,a1,a2]} of this.stages) {
      const numerator=(b0+b1*c+b2*c2)**2+(b1*s+b2*s2)**2;
      const denominator=(1+a1*c+a2*c2)**2+(a1*s+a2*s2)**2;
      db+=10*Math.log10(numerator/denominator);
    }
    return db;
  }
}
