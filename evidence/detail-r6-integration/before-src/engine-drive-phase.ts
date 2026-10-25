/** Separate visual phase for belts and chains. It never drives engine physics. */
export interface EngineDrivePhaseInput {
  phase: number;
  omega: number;
  elapsed: number;
  slow: boolean;
  active: boolean;
  native?: {
    /** Simulation time of the native sample, in seconds. */
    time: number;
    /** Already used extrapolation ANGLE in radians, not sample age in seconds. */
    extrapolation: number;
  };
}

const PERIOD = Math.PI * 4;
const phaseInCycle = (phase: number) => ((phase % PERIOD) + PERIOD) % PERIOD;
type Mode = 'native' | 'integrated' | 'slow';

/**
 * Resolve the number of complete 720-degree turns using the known angular
 * travel, then align exactly to the displayed cycle phase. Guessing only the
 * nearest phase fails when a rendered frame spans several crankshaft turns.
 * Gaps and mode transitions deliberately reanchor without inventing lost turns.
 */
export class EngineDrivePhase {
  value = 0;
  private hasValue = false;
  private anchored = false;
  private mode: Mode | null = null;
  private lastOmega = 0;
  private lastNativeTime = 0;
  private lastExtrapolation = 0;

  /** Explicit engine reset. Keep the supplied finite reference, even unwrapped. */
  reset(phase = 0): number {
    this.hold();
    if (Number.isFinite(phase)) { this.value = phase; this.hasValue = true; }
    return this.value;
  }

  /** Freeze the visible orientation and discard elapsed/source time anchors. */
  hold(): void { this.anchored = false; this.mode = null; }

  private remember(input: EngineDrivePhaseInput, mode: Mode): void {
    this.lastOmega = input.omega;
    this.lastNativeTime = input.native?.time ?? 0;
    this.lastExtrapolation = input.native?.extrapolation ?? 0;
    this.mode = mode;
    this.anchored = true;
  }

  update(input: EngineDrivePhaseInput): number {
    if (!input?.active) { this.hold(); return this.value; }
    if (![input.phase, input.omega, input.elapsed].every(Number.isFinite) ||
      input.native && ![input.native.time, input.native.extrapolation].every(Number.isFinite)) {
      this.hold(); return this.value;
    }
    const phase = phaseInCycle(input.phase);
    const mode: Mode = input.slow ? 'slow' : input.native ? 'native' : 'integrated';
    if (!this.hasValue) {
      this.value = phase; this.hasValue = true; this.remember(input, mode); return this.value;
    }

    let travel = 0;
    if (this.anchored && mode === this.mode) {
      if (mode === 'native') {
        const native = input.native!, elapsed = native.time - this.lastNativeTime;
        if (elapsed < 0) {
          // A new native engine starts its own simulation clock. Its previous
          // full-turn count has no meaning in the new assembly instance.
          this.reset(phase); this.remember(input, mode); return this.value;
        }
        if (elapsed <= .5) {
          travel = (this.lastOmega / 2 + input.omega / 2) * elapsed + native.extrapolation - this.lastExtrapolation;
        }
        // More than half a second without a native sample: keep only the
        // nearest matching orientation, not an asserted number of lost turns.
      } else {
        // Match advanceVisualAngle exactly, including its elapsed-time cap.
        const speed = input.slow ? Math.max(-Math.PI * 2, Math.min(Math.PI * 2, input.omega)) : input.omega;
        travel = speed * Math.max(0, Math.min(.05, input.elapsed));
      }
    }
    const predicted = this.value + travel;
    const aligned = phase + PERIOD * Math.round((predicted - phase) / PERIOD);
    if (!Number.isFinite(predicted) || !Number.isFinite(aligned)) { this.hold(); return this.value; }
    this.value = aligned;
    this.remember(input, mode);
    return this.value;
  }
}
