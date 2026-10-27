/**
 * Hands-free reading: scrolls an element at a constant speed (px/second).
 * Sub-pixel progress carries between frames so slow speeds stay smooth.
 * Emits `change` when started, stopped, paused, resumed or re-speeded.
 */
import { Emitter, clamp } from '../lib/util.ts';

export const MIN_SPEED = 5;
export const MAX_SPEED = 600;

export class AutoScroller extends Emitter<{ change: [] }> {
  active = false;
  paused = false;
  speed: number;
  #target: HTMLElement | null = null;
  #frame = 0;

  constructor(speed = 60) {
    super();
    this.speed = speed;
  }

  start(target: HTMLElement): void {
    this.stop();
    this.#target = target;
    this.active = true;
    this.paused = false;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      if (!this.active || !this.#target) return;
      const seconds = Math.min(0.1, (now - last) / 1000); // clamp after tab switches
      last = now;
      if (!this.paused) {
        carry += this.speed * seconds;
        const whole = Math.floor(carry);
        if (whole >= 1) {
          this.#target.scrollTop += whole;
          carry -= whole;
        }
        const t = this.#target;
        if (t.scrollTop + t.clientHeight >= t.scrollHeight - 1) this.#setPaused(true);
      }
      this.#frame = requestAnimationFrame(tick);
    };
    this.#frame = requestAnimationFrame(tick);
    this.emit('change');
  }

  /** Moves a running scroller to another element (e.g. into reflow view). */
  retarget(target: HTMLElement): void {
    if (this.active) this.#target = target;
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.#frame);
    this.emit('change');
  }

  togglePause(): void {
    this.#setPaused(!this.paused);
  }

  setSpeed(speed: number): void {
    this.speed = clamp(Math.round(speed), MIN_SPEED, MAX_SPEED);
    this.emit('change');
  }

  #setPaused(paused: boolean): void {
    this.paused = paused;
    this.emit('change');
  }
}
