export const THROTTLE_KEYS: Readonly<Record<string, number>> = { KeyQ: .01, KeyW: .1, KeyE: .2, KeyR: 1 };
export type GearShift = 'gear-up' | 'gear-down';

/** Momentary controls: releasing a key always releases its pedal/starter request. */
export class EngineKeys {
  private held = new Set<string>();
  get starter() { return this.held.has('KeyS'); }
  get clutchHeld() { return this.held.has('ShiftLeft') || this.held.has('ShiftRight'); }
  get throttle() { return Math.max(0, ...[...this.held].map(key => THROTTLE_KEYS[key] ?? 0)); }
  down(code: string, _shiftKey = false): 'ignition' | 'pedal' | 'clutch' | GearShift | null {
    if (this.held.has(code)) return null;
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      this.held.add(code);
      return code === 'ArrowUp' ? 'gear-up' : 'gear-down';
    }
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      this.held.add(code);
      return 'clutch';
    }
    if (code !== 'KeyA' && code !== 'KeyS' && !(code in THROTTLE_KEYS)) return null;
    this.held.add(code);
    return code === 'KeyA' ? 'ignition' : 'pedal';
  }
  up(code: string) {
    return this.held.delete(code) && (code === 'KeyS' || code === 'ShiftLeft' || code === 'ShiftRight' || code in THROTTLE_KEYS);
  }
  release() { const changed = this.starter || this.clutchHeld || this.throttle > 0; this.held.clear(); return changed; }
}

/** UI gear numbering uses 0 for neutral and 1–5 for the forward gears. */
export function shiftGear(gear: number, action: GearShift) {
  const current = Number.isFinite(gear) ? Math.max(0, Math.min(5, Math.trunc(gear))) : 0;
  return Math.max(0, Math.min(5, current + (action === 'gear-up' ? 1 : -1)));
}

export function advanceVisualAngle(angle: number, omega: number, elapsed: number, slow: boolean) {
  const cycle = Math.PI * 4;
  const speed = slow ? Math.max(-Math.PI * 2, Math.min(Math.PI * 2, omega)) : omega;
  return ((angle + speed * Math.max(0, Math.min(.05, elapsed))) % cycle + cycle) % cycle;
}
