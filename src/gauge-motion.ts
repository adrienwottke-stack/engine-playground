/** Frame-rate independent short damping; never integrates stale velocity. */
export function followGauge(current: number, target: number, dtMs: number, snap = false) {
  if (snap || !Number.isFinite(current)) return target;
  const value = current + (target - current) * -Math.expm1(-Math.max(0, dtMs) / 24);
  return Math.abs(value - target) < .01 ? target : value;
}
