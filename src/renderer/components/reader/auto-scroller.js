/**
 * Hands-free reading: scrolls an element at a constant speed (px/second).
 * Sub-pixel progress is carried between frames so slow speeds stay smooth.
 *
 * Events: 'change' — started, stopped, paused, resumed or speed changed.
 */
import { Emitter, clamp } from '../../lib/util.js';

export const MIN_SPEED = 5;
export const MAX_SPEED = 600;

export class AutoScroller extends Emitter {
  constructor(speed = 60) {
    super();
    this.active = false;
    this.paused = false;
    this.speed = speed;
    this.target = null;
    this.frame = 0;
  }

  /** @param {HTMLElement} target  the scrolling element */
  start(target) {
    this.stop();
    this.target = target;
    this.active = true;
    this.paused = false;
    let last = performance.now();
    let carry = 0;
    const tick = (now) => {
      if (!this.active) return;
      const seconds = Math.min(0.1, (now - last) / 1000); // clamp after tab switches
      last = now;
      if (!this.paused) {
        carry += this.speed * seconds;
        const whole = Math.floor(carry);
        if (whole >= 1) {
          this.target.scrollTop += whole;
          carry -= whole;
        }
        if (this.target.scrollTop + this.target.clientHeight >= this.target.scrollHeight - 1) this.#setPaused(true);
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
    this.emit('change');
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.frame);
    this.emit('change');
  }

  togglePause() {
    this.#setPaused(!this.paused);
  }

  setSpeed(speed) {
    this.speed = clamp(Math.round(speed), MIN_SPEED, MAX_SPEED);
    this.emit('change');
  }

  #setPaused(paused) {
    this.paused = paused;
    this.emit('change');
  }
}
