export type SoundSettings = {preset:'m52'|'m54'|'i6';hfGain:number;noise:number;jitter:number;convolution:number;impulse:string;idleAssist:boolean};
export const DEFAULT_SOUND: Readonly<SoundSettings>;
export const IMPULSES: readonly string[];
export function validateSound(raw?:unknown):SoundSettings;
export function referenceScript(base:string,sound:SoundSettings,geometry:number[],tuning?:TuningSelection):string;
import type { TuningSelection } from './tuning-settings.mjs';
