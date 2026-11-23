// A local profile is not a verified account. Only explicit test builds enable it.
import { LOCAL_EXPERIENCE_ENABLED } from './build-flags.js';

export const LOCAL_EXPERIENCE_KEY = 'along.localExperience.v1';
const PROFILE = Object.freeze({
  id: 'along-local-experience-v1', email: 'local-experience@along.invalid',
  displayName: 'Along Local Experience', role: 'LOCAL', localOnly: true,
});

export function createLocalExperience({ enabled = false, storage = () => globalThis.localStorage } = {}) {
  let active = false;
  let persistent = false;
  const listeners = new Set();
  if (enabled) {
    try {
      const value = JSON.parse(storage()?.getItem(LOCAL_EXPERIENCE_KEY) || 'null');
      active = value?.version === 1 && value?.active === true;
      persistent = active;
    } catch { /* unavailable or corrupt storage never invents an identity */ }
  }
  const notify = () => listeners.forEach((fn) => fn(active));
  return {
    enabled: () => enabled,
    active: () => enabled && active,
    session: () => enabled && active ? PROFILE : null,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    enter() {
      if (!enabled) return { ok: false, error: 'LOCAL_EXPERIENCE_DISABLED' };
      try {
        const target = storage();
        if (!target) throw new Error('Storage unavailable');
        target.setItem(LOCAL_EXPERIENCE_KEY, JSON.stringify({ version: 1, active: true }));
        persistent = true;
      } catch { persistent = false; }
      active = true;
      notify();
      return { ok: true, persistent, session: PROFILE };
    },
    leave() {
      if (!active) return { ok: true };
      try {
        const target = storage();
        if (!target && persistent) throw new Error('Storage unavailable');
        target?.removeItem(LOCAL_EXPERIENCE_KEY);
      } catch {
        if (persistent) return { ok: false, error: 'STORAGE' };
      }
      active = false;
      persistent = false;
      notify();
      return { ok: true };
    },
  };
}

const experience = createLocalExperience({ enabled: LOCAL_EXPERIENCE_ENABLED });
export const localExperienceEnabled = () => experience.enabled();
export const localExperienceActive = () => experience.active();
export const localExperienceSession = () => experience.session();
export const enterLocalExperience = () => experience.enter();
export const leaveLocalExperience = () => experience.leave();
export const onLocalExperienceChange = (fn) => experience.subscribe(fn);
export function localExperienceError() {
  return Object.assign(new Error('A local experience profile cannot use online services.'), { code: 'LOCAL_EXPERIENCE_ONLY', status: 0 });
}
