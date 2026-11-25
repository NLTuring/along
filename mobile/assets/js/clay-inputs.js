// What a traveller can hand the AI for a 3D start: a photo, a short video, or a few words.
// A video never leaves the phone whole: 3–4 evenly spaced frames are taken here and sent as JPEGs,
// so the two AIs see the subject from several sides.
export const AI_KINDS = ['image', 'video', 'text'];
// One declaration each: mobile/tools/check.mjs matches exports by `export const NAME`.
export const PROMPT_MIN = 2;
export const PROMPT_MAX = 600;
export const VIDEO_MAX_SECONDS = 60;

/** Times (seconds) for `count` frames spread over the clip, skipping the very start and end. */
export function frameTimes(duration, count = 4) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const n = Math.max(2, Math.min(4, count));
  return Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) / n) * duration * 100) / 100);
}

export function cleanPrompt(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PROMPT_MAX);
}

function once(target, ok, bad = 'error', ms = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { done(); reject(new Error('VIDEO_TIMEOUT')); }, ms);
    const yes = () => { done(); resolve(); }, no = () => { done(); reject(new Error('VIDEO_UNREADABLE')); };
    function done() { clearTimeout(timer); target.removeEventListener(ok, yes); target.removeEventListener(bad, no); }
    target.addEventListener(ok, yes); target.addEventListener(bad, no);
  });
}

/** Decode a video file in the page and return up to 4 JPEG blobs (longest side 1024 px). */
export async function videoFrames(file, { count = 4, max = 1024 } = {}) {
  const url = URL.createObjectURL(file), video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
  try {
    // Metadata, not 'loadeddata': iOS Safari may never load frame data for an unplayed video,
    // and each 'seeked' below already guarantees a frame to draw.
    await once(video, 'loadedmetadata');
    if (video.duration > VIDEO_MAX_SECONDS + 1) throw new Error('VIDEO_TOO_LONG');
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale)); canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext('2d'), blobs = [];
    for (const time of frameTimes(video.duration, count)) {
      video.currentTime = time;
      await once(video, 'seeked');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      blobs.push(await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ENCODE'))), 'image/jpeg', 0.86)));
    }
    if (blobs.length < 2) throw new Error('VIDEO_UNREADABLE');
    return blobs;
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}

/** How the model is made: two AIs in turn (cheaper) or Tripo directly (dearer). The server sets the price. */
export const AI_ENGINES = ['relay', 'tripo'];
export const ENGINE_ITEM = Object.freeze({ relay: 'AI_MODEL', tripo: 'AI_MODEL_TRIPO' });

/** Multipart body for POST /api/ai-models. */
export function jobForm({ kind, key, engine = 'relay', image = null, frames = [], prompt = '' }) {
  const form = new FormData();
  form.append('idempotencyKey', key); form.append('consent', 'true'); form.append('kind', kind);
  if (AI_ENGINES.includes(engine)) form.append('engine', engine);
  if (kind === 'image') form.append('image', image, 'photo.jpg');
  else if (kind === 'video') frames.slice(0, 4).forEach((blob, i) => form.append(`frame${i}`, blob, `frame${i}.jpg`));
  else form.append('prompt', cleanPrompt(prompt));
  return form;
}
