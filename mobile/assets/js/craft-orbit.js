// Turning a keepsake with a finger: drag to turn it, flick to let it spin on, pinch or wheel
// to look closer, double-tap to face it front on. Pure state, so it can be tested without a DOM.
import { normalizePose, MAX_TILT } from './crafts.js';

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 2.6;
const DRAG_START = 4;          // px before a press becomes a turn (a long press stays put)
const FRICTION = 0.0035;       // per ms: how fast a flick slows down
const STOP_SPEED = 0.01;       // deg/ms below which the spin ends
const MAX_SPEED = 1.6;         // deg/ms
const SAMPLE_MS = 90;          // how much recent movement sets the flick speed
const DOUBLE_TAP_MS = 300;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// `degreesPerPx` scales with the stage: one stage width of drag turns the keepsake about 300°.
export function createOrbit({ pose = normalizePose(), zoom = 1, now = () => performance.now(), reduceMotion = () => false } = {}) {
  let rotation = pose.rotation, tilt = pose.tilt, scale = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  let velocity = { rotation: 0, tilt: 0 }, spinning = false;
  const pointers = new Map();
  let drag = null, pinch = null, lastTap = null, samples = [];
  let degreesPerPx = 0.8;

  const state = () => ({ rotation: ((rotation % 360) + 360) % 360, tilt, zoom: scale });
  function setTilt(value) { tilt = clamp(value, -MAX_TILT, MAX_TILT); }
  function startDrag(point) {
    drag = { id: point.id, x: point.x, y: point.y, rotation, tilt, moved: false };
    samples = [{ t: now(), rotation, tilt }];
  }
  function startPinch() {
    const [a, b] = [...pointers.values()];
    pinch = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: scale };
    drag = null; samples = [];
  }
  function flickSpeed() {
    const t = now(), recent = samples.filter((s) => t - s.t <= SAMPLE_MS);
    if (recent.length < 2) return { rotation: 0, tilt: 0 };
    const first = recent[0], last = recent.at(-1), dt = Math.max(16, last.t - first.t);
    return { rotation: clamp((last.rotation - first.rotation) / dt, -MAX_SPEED, MAX_SPEED), tilt: clamp((last.tilt - first.tilt) / dt, -MAX_SPEED, MAX_SPEED) };
  }

  return {
    get state() { return state(); },
    get spinning() { return spinning; },
    get dragging() { return !!drag?.moved || !!pinch; },
    setScale(width) { if (Number.isFinite(width) && width > 0) degreesPerPx = clamp(300 / width, 0.35, 1.2); },
    setPose(next) { const p = normalizePose(next.rotation, next.tilt); rotation = p.rotation; tilt = p.tilt; velocity = { rotation: 0, tilt: 0 }; spinning = false; },
    // -> { started } so the page can cancel a long press once a finger turns the model.
    down(point) {
      spinning = false; velocity = { rotation: 0, tilt: 0 };
      pointers.set(point.id, { x: point.x, y: point.y });
      if (pointers.size === 2) { startPinch(); return { pinch: true }; }
      if (pointers.size > 2) { drag = null; pinch = null; return {}; }
      startDrag(point);
      return {};
    },
    // -> { turned, zoomed } when something visible changed.
    move(point) {
      if (!pointers.has(point.id)) return {};
      pointers.set(point.id, { x: point.x, y: point.y });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        scale = clamp(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance, ZOOM_MIN, ZOOM_MAX);
        return { zoomed: true };
      }
      if (!drag || drag.id !== point.id) return {};
      const dx = point.x - drag.x, dy = point.y - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) <= DRAG_START) return {};
      drag.moved = true;
      // The face follows the finger: drag right turns it right, drag down tips its top toward you.
      rotation = drag.rotation + dx * degreesPerPx;
      setTilt(drag.tilt + dy * degreesPerPx * 0.6);
      samples.push({ t: now(), rotation, tilt });
      if (samples.length > 12) samples.shift();
      return { turned: true, started: true };
    },
    // -> { settled } when the gesture ended and the pose should be saved; { reset } on a double tap.
    up(point, { cancelled = false } = {}) {
      if (!pointers.has(point.id)) return {};
      pointers.delete(point.id);
      if (pinch) {
        pinch = null;
        // The finger still down carries on turning from here.
        const [id, rest] = [...pointers.entries()][0] || [];
        if (id !== undefined) startDrag({ id, ...rest });
        return {};
      }
      if (!drag || drag.id !== point.id) return {};
      const moved = drag.moved;
      drag = null;
      if (cancelled) return moved ? { settled: true } : {};
      if (!moved) {
        const t = now();
        if (lastTap && t - lastTap.t < DOUBLE_TAP_MS && Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < 30) {
          lastTap = null; rotation = 0; tilt = 0; scale = 1;
          return { reset: true, settled: true };
        }
        lastTap = { t, x: point.x, y: point.y };
        return {};
      }
      lastTap = null;
      velocity = reduceMotion() ? { rotation: 0, tilt: 0 } : flickSpeed();
      spinning = Math.hypot(velocity.rotation, velocity.tilt) > STOP_SPEED;
      return spinning ? {} : { settled: true };
    },
    // Advance a flick by `dt` ms. -> { turned, settled }
    step(dt) {
      if (!spinning) return {};
      const ms = clamp(dt, 0, 64), decay = Math.exp(-FRICTION * ms);
      rotation += velocity.rotation * ms;
      setTilt(tilt + velocity.tilt * ms);
      if (Math.abs(tilt) >= MAX_TILT) velocity.tilt = 0;
      velocity = { rotation: velocity.rotation * decay, tilt: velocity.tilt * decay };
      if (Math.hypot(velocity.rotation, velocity.tilt) <= STOP_SPEED) { spinning = false; velocity = { rotation: 0, tilt: 0 }; return { turned: true, settled: true }; }
      return { turned: true };
    },
    wheel(deltaY) {
      if (!Number.isFinite(deltaY) || !deltaY) return {};
      scale = clamp(scale * Math.exp(-deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX);
      return { zoomed: true };
    },
    zoomBy(factor) { scale = clamp(scale * factor, ZOOM_MIN, ZOOM_MAX); return { zoomed: true }; },
    stop() { spinning = false; velocity = { rotation: 0, tilt: 0 }; },
    reset() { pointers.clear(); drag = null; pinch = null; samples = []; spinning = false; velocity = { rotation: 0, tilt: 0 }; },
  };
}
