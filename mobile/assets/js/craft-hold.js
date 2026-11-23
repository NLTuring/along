// One long-press activation per uninterrupted primary pointer, exactly five seconds.
export const HOLD_MS = 5000;
export function createHoldController({ onProgress = () => {}, onComplete = () => {}, now = () => performance.now(),
  schedule = (fn, ms) => setTimeout(fn, ms), unschedule = (id) => clearTimeout(id), duration = HOLD_MS, movement = 6 } = {}) {
  let active = null, timer = null, disposed = false;
  const pointers = new Set();
  function cancel() {
    if (timer !== null) unschedule(timer);
    timer = null; active = null; onProgress(0);
  }
  function tick() {
    if (!active || disposed) return;
    const progress = Math.min(1, Math.max(0, (now() - active.started) / duration));
    onProgress(progress);
    if (progress >= 1) {
      timer = null; active = null;
      onComplete(); // no timer remains; holding beyond 5s never repeats
    } else timer = schedule(tick, Math.min(40, duration - (now() - active.started)));
  }
  return {
    down(event) {
      if (disposed) return;
      pointers.add(event.pointerId);
      if (pointers.size !== 1 || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) { cancel(); return; }
      active = { id: event.pointerId, x: event.clientX, y: event.clientY, started: now() };
      onProgress(0); timer = schedule(tick, 40);
    },
    move(event) {
      if (active && event.pointerId === active.id && Math.hypot(event.clientX - active.x, event.clientY - active.y) > movement) cancel();
    },
    up(event) { pointers.delete(event.pointerId); if (active?.id === event.pointerId || pointers.size === 0) cancel(); },
    cancel,
    reset() { pointers.clear(); cancel(); },
    dispose() { disposed = true; pointers.clear(); cancel(); },
  };
}

export function attachHold(host, options) {
  const controller = createHoldController(options);
  const down = (event) => {
    controller.down(event);
    if (event.isPrimary && !(event.pointerType === 'mouse' && event.button !== 0)) {
      try { host.setPointerCapture?.(event.pointerId); } catch { controller.cancel(); }
    }
  };
  const outsideDown = (event) => { if (!host.contains(event.target)) controller.cancel(); };
  const cancel = () => controller.reset();
  const visibility = () => { if (document.hidden) cancel(); };
  const context = (event) => event.preventDefault();
  host.addEventListener('pointerdown', down);
  host.addEventListener('pointermove', controller.move);
  host.addEventListener('pointerup', controller.up);
  host.addEventListener('pointercancel', cancel);
  host.addEventListener('lostpointercapture', cancel);
  host.addEventListener('contextmenu', context);
  document.addEventListener('pointerdown', outsideDown, true);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('blur', cancel);
  return {
    cancel,
    dispose() {
      controller.dispose();
      host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', controller.move);
      host.removeEventListener('pointerup', controller.up); host.removeEventListener('pointercancel', cancel);
      host.removeEventListener('lostpointercapture', cancel); host.removeEventListener('contextmenu', context);
      document.removeEventListener('pointerdown', outsideDown, true); document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', cancel);
    },
  };
}
