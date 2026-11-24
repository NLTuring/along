// Hand-over between workshop pages inside one app session: a clay recipe to open on the bench,
// a finished piece to put in the gallery. Kept in memory: models and photos are too big for
// sessionStorage, and a reload simply starts the page fresh.
let pending = new Map();
export function setDraft(name, value) { pending.set(name, value); }
export function takeDraft(name) { const value = pending.get(name); pending.delete(name); return value ?? null; }
export function peekDraft(name) { return pending.get(name) ?? null; }
