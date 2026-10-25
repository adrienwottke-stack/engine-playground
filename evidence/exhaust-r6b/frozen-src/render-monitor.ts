/** Bounded measurements exposed in DOM attributes for local performance checks. */
export class RenderMonitor {
  private started = 0;
  private previous = 0;
  private intervals: number[] = [];
  private costs: number[] = [];
  sample(now: number, cost: number) {
    if (document.hidden) { this.started = this.previous = 0; this.intervals = []; this.costs = []; return; }
    if (!this.started) this.started = now;
    if (this.previous) this.intervals.push(now - this.previous);
    this.previous = now;
    this.costs.push(cost);
    if (now - this.started < 5000) return;
    const sorted = this.intervals.slice().sort((a,b) => a-b);
    const root = document.getElementById('app')!;
    root.dataset.renderFps = (this.intervals.length * 1000 / (now - this.started)).toFixed(1);
    root.dataset.frameP95Ms = (sorted[Math.floor(sorted.length * .95)] ?? 0).toFixed(1);
    root.dataset.renderMeanMs = (this.costs.reduce((a,b) => a+b,0) / this.costs.length).toFixed(2);
    root.dataset.longFrames = String(this.intervals.filter(t => t > 50).length);
    this.started = now; this.intervals = []; this.costs = [];
  }
}
