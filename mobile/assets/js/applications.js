// Along — local companion application drafts. Nothing is sent to a reviewer.
const KEY = 'instrip.guideApplications';
export const APPLICATION_CITIES = ['shanghai', 'nanjing'];
export const APPLICATION_LANGUAGES = ['en', 'zh'];
export const APPLICATION_TOPICS = ['Photography', 'Food', 'History', 'Architecture', 'SlowWalks'];
export const APPLICATION_SLOTS = ['weekday-am', 'weekday-pm', 'weekend-am', 'weekend-pm'];

const owner = (email) => typeof email === 'string' ? email.trim().toLowerCase() : '';
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
const pick = (values, allowed) => Array.isArray(values) ? [...new Set(values.filter((value) => allowed.includes(value)))] : [];

export function applicationFields(input = {}) {
  input = input && typeof input === 'object' ? input : {};
  return {
    name: typeof input.name === 'string' ? input.name.slice(0, 60) : '',
    city: APPLICATION_CITIES.includes(input.city) ? input.city : '',
    languages: pick(input.languages, APPLICATION_LANGUAGES),
    topics: pick(input.topics, APPLICATION_TOPICS),
    bio: typeof input.bio === 'string' ? input.bio.slice(0, 500) : '',
    availability: pick(input.availability, APPLICATION_SLOTS),
    agree: input.agree === true,
  };
}

export function validateApplication(input = {}) {
  input = input && typeof input === 'object' ? input : {};
  const fields = applicationFields(input);
  const errors = [];
  if (fields.name.trim().length < 2 || String(input.name || '').length > 60) errors.push('name');
  if (!fields.city) errors.push('city');
  if (!fields.languages.length) errors.push('languages');
  if (!fields.topics.length) errors.push('topics');
  if (fields.bio.trim().length < 30 || String(input.bio || '').length > 500) errors.push('bio');
  if (!fields.availability.length) errors.push('availability');
  if (!fields.agree) errors.push('agree');
  return errors;
}

function readAll() {
  const list = JSON.parse(localStorage.getItem(KEY) || '[]');
  if (!Array.isArray(list)) return [];
  return list.filter((item) => item && typeof item.id === 'string' && item.id && typeof item.email === 'string'
    && (validEmail(item.email) || (item.email === '' && item.status === 'DRAFT'))
    && ['DRAFT', 'SUBMITTED'].includes(item.status))
    .map((item) => ({ ...item, fields: applicationFields(item.fields || {}) }));
}

export function getApplication(email = '') {
  try { return readAll().find((item) => item.email === owner(email)) || null; }
  catch { return null; }
}

export function getApplicationDraft(email = '') {
  const current = getApplication(email);
  if (current) return current;
  const guest = getApplication('');
  return guest?.status === 'DRAFT' ? guest : null;
}

function sameFields(first, second) {
  const canonical = (input) => {
    const fields = applicationFields(input);
    fields.name = fields.name.trim();
    fields.bio = fields.bio.trim();
    fields.languages.sort();
    fields.topics.sort();
    fields.availability.sort();
    return JSON.stringify(fields);
  };
  return canonical(first) === canonical(second);
}

function writeApplication(email, input, status, { revise = false, now = Date.now() } = {}) {
  const emailKey = owner(email);
  if ((emailKey && !validEmail(emailKey)) || (status === 'SUBMITTED' && !validEmail(emailKey))) {
    return { ok: false, error: 'LOGIN' };
  }
  if (status === 'SUBMITTED') {
    const fields = validateApplication(input);
    if (fields.length) return { ok: false, error: 'VALIDATION', fields };
  }
  try {
    const all = readAll();
    const previous = all.find((item) => item.email === emailKey);
    if (previous?.status === 'SUBMITTED' && !revise) {
      return status === 'SUBMITTED' && sameFields(previous.fields, input)
        ? { ok: true, application: previous } : { ok: false, error: 'CONFLICT' };
    }
    const fields = applicationFields(input);
    if (status === 'SUBMITTED') { fields.name = fields.name.trim(); fields.bio = fields.bio.trim(); }
    const application = {
      id: previous?.id || `ap_${crypto.getRandomValues(new Uint32Array(2)).join('_')}`,
      email: emailKey, fields, status,
      revision: (previous?.revision || 0) + (revise ? 1 : 0),
      createdAt: previous?.createdAt || now, updatedAt: now,
      submittedAt: status === 'SUBMITTED' ? now : null,
    };
    const next = all.filter((item) => item.email !== emailKey);
    next.push(application);
    localStorage.setItem(KEY, JSON.stringify(next));
    return { ok: true, application };
  } catch {
    return { ok: false, error: 'STORAGE' };
  }
}

export function saveApplicationDraft(email, input, options) {
  return writeApplication(email, input, 'DRAFT', options);
}

export function submitApplication(email, input, options) {
  return writeApplication(email, input, 'SUBMITTED', options);
}

// A guest draft is only removed after that exact draft was durably submitted after login.
export function clearGuestApplication(input, submitted) {
  try {
    const list = readAll();
    const guest = list.find((item) => item.email === '' && item.status === 'DRAFT');
    if (!guest || !sameFields(guest.fields, input)) return true;
    const saved = list.find((item) => item.id === submitted?.id && item.email === submitted?.email
      && validEmail(item.email) && item.status === 'SUBMITTED');
    if (!saved || submitted.status !== 'SUBMITTED' || saved.revision !== submitted.revision
      || saved.submittedAt !== submitted.submittedAt || !sameFields(submitted.fields, input)
      || !sameFields(saved.fields, input)) return false;
    localStorage.setItem(KEY, JSON.stringify(list.filter((item) => item !== guest)));
    return true;
  } catch { return false; }
}
