// Versioned PCM envelope. The marker is the last native-confirmed state before
// this PCM block, so it gives a conservative command-to-output bound, not an
// estimate based on the HTTP command acknowledgement.
export const AUDIO_MAGIC=0x32415045, AUDIO_HEADER=48;
export function frameAudio(pcm,state,frameIndex){
  if(pcm.length%2)throw new Error('PCM block must contain complete s16 samples');
  const out=Buffer.allocUnsafe(AUDIO_HEADER+pcm.length);
  out.writeUInt32LE(AUDIO_MAGIC,0);out.writeUInt32LE(pcm.length/2,4);
  out.writeDoubleLE(state?.timestampMs??0,8);out.writeDoubleLE(state?.sequence??0,16);
  out.writeDoubleLE(state?.t??0,24);out.writeFloatLE(state?.actualThrottle??0,32);
  out.writeFloatLE(state?.rpm??0,36);out.writeUInt32LE(frameIndex>>>0,40);out.writeUInt32LE(44100,44);
  pcm.copy(out,AUDIO_HEADER);return out;
}
