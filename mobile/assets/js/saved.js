// InsTrip mobile — locally saved places.
// Saved place IDs are intentionally kept in their own localStorage key so this
// small browser feature cannot overwrite plans, bookings, media, or settings.

const STORE_KEY = 'instrip.saved';

function readSaved() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.reduce((list, id) => {
      if (typeof id !== 'string') return list;
      const clean = id.trim();
      if (!clean || seen.has(clean)) return list;
      seen.add(clean);
      list.push(clean);
      return list;
    }, []);
  } catch {
    return [];
  }
}

function writeSaved(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function listSaved() {
  return readSaved();
}

export function isSaved(id) {
  if (typeof id !== 'string' || !id.trim()) return false;
  return readSaved().includes(id.trim());
}

// Returns the persisted state after the toggle. If storage is unavailable, the
// old state is returned so callers never claim a change that was not saved.
export function toggleSaved(id) {
  if (typeof id !== 'string' || !id.trim()) return false;
  const clean = id.trim();
  const list = readSaved();
  const index = list.indexOf(clean);
  const nextSaved = index < 0;
  if (nextSaved) list.push(clean);
  else list.splice(index, 1);
  return writeSaved(list) ? nextSaved : index >= 0;
}

export function clearSaved() {
  try {
    localStorage.removeItem(STORE_KEY);
    return true;
  } catch {
    return false;
  }
}

export { STORE_KEY };
