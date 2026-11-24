// Along mobile — 小游 / Along, the optional in-app assistant. Off by default (You → settings).
// Plain commands ("打开数字藏品", "带我去中山陵", "返回", "切换成英文") are carried out at once,
// without AI or sign-in; everything else is a conversation, and when the user asked to be taken
// somewhere, the first page or place in the answer is opened by itself.
// Tap: open the chat sheet. Long-press: talk. The browser's own speech recognition is used where
// it exists; the Android shell has no microphone bridge, so there the keyboard's voice typing is
// used and the dictated text is sent once it settles. Conversations stay in memory only.
import { t, te, esc, getLocale, setLocale, onLocaleChange } from './i18n.js';
import { icon } from './icons.js';
import { openSheet, closeSheet, sheetIsOpen, toast, getSettings, setSetting, onSettingsChange } from './ui.js';
import { api, getRuntimeConfig } from './api.js';
import { getSession, onSessionChange } from './auth.js';
import { openLogin } from './login.js';
import { go, back } from './router.js';
import { POIS } from './seed-places.js';
import { GUIDES } from './seed.js';
import { WINDOW_PLACES } from './window-scenes.js';
import { openCamera } from './nav.js';
import { openPostComposer } from './post-sheet.js';
import { mascotSvg, setMascotState, ensureMascotDefs } from './assistant-mascot.js';
import { clientActions, stashFriendsFilter, filterTopic, createPressGesture, createSettleSender, conversationPayload, voiceMode, HARD_SPEECH_ERRORS, LONG_PRESS_MS, SENIOR_LONG_PRESS_MS, NAVIGATING } from './assistant-core.js';
import { parseCommand, asksToGo } from './assistant-commands.js';
import { guideText } from './seed-text.js';
import { TRAVEL_PLACES } from './seed-food.js';

// Flow pages keep their own controls at the bottom; 小游 steps aside there.
const HIDDEN_ON = new Set(['map', 'craft', 'film', 'studio', 'checkout', 'messages', 'guide', 'apply', 'post', 'make-order', 'example', 'dm']);
const CHIPS = ['howto', 'navigate', 'translate', 'recommend', 'friends'];
const history = [];
let host = null, current = { name: 'trip' }, busy = false, sheet = null, recognizer = null, settle = null, idleTimer = 0;

const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
// Set after the first hard recognition error; from then on this session uses keyboard voice typing.
let recognitionFailed = false, composing = false;
const listenMode = () => voiceMode({ hasRecognition: !!Recognition, origin: location.origin, userAgent: navigator.userAgent, nativeBridge: typeof window.Android === 'object', failed: recognitionFailed });
const enabled = () => getSettings().assistant === true;
const cityOf = (route) => (route?.param && POIS[route.param]?.citySlug) || undefined;

function availability() {
  const session = getSession(), config = getRuntimeConfig();
  if (session?.localOnly || config.localOnly) return 'local';
  if (!config.connected) return 'offline';
  if (config.ai?.assistantAvailable !== true) return 'unconfigured';
  if (!session) return 'signin';
  return 'ready';
}

function mood(expression, action, ms = 0) {
  if (!host) return;
  clearTimeout(idleTimer);
  setMascotState(document, { expression, action });
  if (ms) idleTimer = setTimeout(() => setMascotState(document, { expression: 'happy', action: 'idle' }), ms);
}

function renderHost() {
  if (host) return host;
  ensureMascotDefs();
  host = document.createElement('div');
  host.id = 'assistant';
  host.innerHTML = `<button class="xy-fab" type="button" data-assistant-fab aria-haspopup="dialog" aria-label="${te('assistant.fab')}" aria-describedby="assistant-hint">
      <svg class="xy-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29"/></svg>
      <span class="xy-lens">${mascotSvg({ expression: 'happy', action: 'idle', crop: 'avatar' })}</span>
    </button><p class="sr-only" id="assistant-hint">${te('assistant.fab.hint')}</p>`;
  document.body.append(host);
  const fab = host.querySelector('[data-assistant-fab]'), ring = host.querySelector('.xy-ring circle');
  const progress = (value) => { ring.style.strokeDashoffset = String(182.2 * (1 - value)); host.classList.toggle('is-pressing', value > 0); };
  const gesture = createPressGesture({
    threshold: getSettings().senior ? SENIOR_LONG_PRESS_MS : LONG_PRESS_MS,
    onProgress: progress,
    onTap: () => openChat(),
    onLong: () => { navigator.vibrate?.(12); startVoice(); },
    // Releasing ends browser recognition; keyboard voice typing keeps going until the text settles.
    onRelease: () => { if (recognizer) stopVoice(true); },
    onCancel: ({ afterLong }) => { if (afterLong && recognizer) stopVoice(false); },
  });
  fab.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    gesture.down(event.clientX, event.clientY);
    // Capture keeps the press alive if the finger drifts; some WebViews refuse it, which is harmless.
    try { fab.setPointerCapture?.(event.pointerId); } catch { /* press still works without capture */ }
  });
  fab.addEventListener('pointermove', (event) => gesture.move(event.clientX, event.clientY));
  fab.addEventListener('pointerup', () => gesture.up());
  fab.addEventListener('pointercancel', () => gesture.cancel());
  fab.addEventListener('contextmenu', (event) => event.preventDefault());
  // Keyboard and screen readers: Enter/Space open the chat; the mic is inside the dialog.
  fab.addEventListener('click', (event) => { if (event.detail === 0) openChat(); });
  return host;
}

function updateVisibility() {
  const show = enabled() && !HIDDEN_ON.has(current.name) && document.documentElement.dataset.nativeMap !== 'active';
  if (!show) { host?.remove(); host = null; if (sheet) closeSheet(); return; }
  renderHost();
  host.classList.toggle('xy--nav-hidden', document.documentElement.dataset.nav === 'hidden');
}

function bubble(role, text, actions = []) {
  const li = document.createElement('li');
  li.className = `bubble bubble--${role === 'user' ? 'me' : 'along'}`;
  li.innerHTML = `${role === 'user' ? '' : `<span class="xy-avatar" aria-hidden="true">${mascotSvg({ expression: 'happy', action: 'idle', crop: 'avatar', live: false })}</span>`}<div class="bubble__body"><p>${esc(text).replace(/\n/g, '<br>')}</p>${actions.length ? `<div class="xy-actions">${actions.map(actionButton).join('')}</div>` : ''}</div>`;
  li.querySelectorAll('[data-xy-action]').forEach((button, i) => { button.onclick = () => runAction(actions[i]); });
  return li;
}

// Trip stops, the window's own places, restaurants and stay areas: everything 小游 can find on the map.
const PLACES = { ...POIS, ...WINDOW_PLACES, ...TRAVEL_PLACES };
const placeName = (id) => (getLocale() === 'zh' ? PLACES[id]?.nameZh : PLACES[id]?.nameEn) || '';
const pageName = (route) => t(`assistant.page.${route}`);
const COMMAND_DELAY_MS = 650;

// What 小游 says before doing a command, in the user's language.
function commandReply(command) {
  if (command.kind === 'go' && command.place) return t('assistant.do.place', { name: placeName(command.place) });
  if (command.kind === 'go' && command.guide) return t('assistant.do.guide', { name: guideText(GUIDES.find((g) => g.id === command.guide))?.name || '' });
  if (command.kind === 'go') return t('assistant.do.open', { page: pageName(command.route) });
  if (command.kind === 'locale') return t(`assistant.do.locale.${command.value}`);
  if (command.kind === 'setting') return t(`assistant.do.${command.key}.${command.value === true || command.value === 'reduced' ? 'on' : 'off'}`);
  return t(`assistant.do.${command.kind}`);
}

function runCommand(command) {
  closeSheet();
  if (command.kind === 'go') go(command.path);
  else if (command.kind === 'back') back('trip');
  else if (command.kind === 'camera') openCamera();
  else if (command.kind === 'post') openPostComposer();
  else if (command.kind === 'locale') void setLocale(command.value);
  else if (command.kind === 'setting') setSetting(command.key, command.value);
}

function actionButton(a) {
  const zh = getLocale() === 'zh';
  const place = PLACES[a.id], guide = GUIDES.find((g) => g.id === a.id);
  let label = '';
  if (a.type === 'place') label = t('assistant.action.place', { name: zh ? place.nameZh : place.nameEn });
  else if (a.type === 'directions') label = t('assistant.action.directions', { name: zh ? place.nameZh : place.nameEn });
  else if (a.type === 'guide') label = t('assistant.action.guide', { name: guideText(guide).name });
  else if (a.type === 'friends') {
    const topic = a.filter.topic ? filterTopic(a.filter.topic) : 'all';
    const topicLabel = topic === 'all' ? '' : t(topic === 'Architecture' ? 'guides.filter.architecture' : `interest.${topic}`);
    label = [t('assistant.action.friends'), a.filter.city && t(`city.${a.filter.city}`), a.filter.kind && t(`guide.kind.${a.filter.kind}`), topicLabel].filter(Boolean).join(' · ');
  }
  else if (a.type === 'open') label = t('assistant.action.open', { page: t(`assistant.page.${a.route}`) });
  else if (a.type === 'copy') label = t('assistant.action.copy');
  return `<button class="btn xy-action" type="button" data-xy-action>${a.type === 'copy' ? '' : icon('chevron', { size: 16 })}<span>${esc(label)}</span></button>`;
}

async function runAction(a) {
  if (a.type === 'copy') {
    try { await navigator.clipboard.writeText(a.text); toast(t('assistant.copied')); }
    catch { toast(t('assistant.copy.failed')); }
    return;
  }
  if (a.type === 'friends') stashFriendsFilter({ ...a.filter, topic: a.filter.topic ? filterTopic(a.filter.topic) : undefined });
  mood('happy', 'guide', 1600);
  closeSheet();
  go(a.path);
}

function setStatus(text) { const el = sheet?.querySelector('[data-xy-status]'); if (el) el.textContent = text; }

function localAnswer(kind) {
  // The "how to use" chip works offline and without sign-in.
  if (kind === 'howto') return t('assistant.local.howto');
  return t(`assistant.state.${availability()}`);
}

async function send(text) {
  const message = String(text || '').trim().slice(0, 1000);
  if (!message || busy || !sheet) return;
  const list = sheet.querySelector('[data-xy-list]'), input = sheet.querySelector('[data-xy-input]');
  history.push({ role: 'user', text: message });
  list.append(bubble('user', message));
  input.value = ''; settle?.disarm();
  // A plain command is done at once, here on the phone: no AI, no sign-in needed.
  const command = parseCommand(message, { places: PLACES, guides: GUIDES });
  if (command) {
    const answer = commandReply(command);
    history.push({ role: 'assistant', text: answer });
    list.append(bubble('assistant', answer)); scrollEnd();
    mood('happy', 'guide', 1600);
    busy = true; refreshComposer();
    setTimeout(() => { busy = false; refreshComposer(); runCommand(command); }, COMMAND_DELAY_MS);
    return;
  }
  const state = availability();
  if (state !== 'ready') {
    const answer = state === 'signin' ? t('assistant.state.signin') : t(`assistant.state.${state}`);
    history.push({ role: 'assistant', text: answer });
    list.append(bubble('assistant', answer));
    if (state === 'signin') list.lastElementChild.querySelector('.bubble__body').insertAdjacentHTML('beforeend', `<button class="btn btn--small" type="button" data-xy-login>${te('you.signin')}</button>`);
    list.lastElementChild.querySelector('[data-xy-login]')?.addEventListener('click', () => { closeSheet(); openLogin(); });
    mood('sorry', 'idle', 2400); scrollEnd(); return;
  }
  busy = true; refreshComposer(); setStatus(t('assistant.thinking')); mood('thinking', 'think');
  const typing = document.createElement('li'); typing.className = 'bubble bubble--along bubble--typing'; typing.innerHTML = `<span class="xy-avatar" aria-hidden="true">${mascotSvg({ expression: 'thinking', action: 'idle', crop: 'avatar', live: false })}</span><div class="bubble__body"><span class="xy-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>`;
  list.append(typing); scrollEnd();
  try {
    const result = await api('/assistant/chat', { method: 'POST', timeoutMs: 60_000, body: conversationPayload(history, { locale: getLocale(), route: current.name, city: cityOf(current) }) });
    const actions = clientActions(result.actions, { places: PLACES, guides: GUIDES });
    history.push({ role: 'assistant', text: result.reply });
    typing.replaceWith(bubble('assistant', result.reply, actions));
    const expression = ['happy', 'thinking', 'excited', 'sorry', 'proud', 'normal'].includes(result.mood) ? result.mood : 'happy';
    mood(expression, actions.some((a) => a.type !== 'copy') ? 'guide' : 'talk', 2600);
    setStatus('');
    // "Take me to…": follow the answer's first page or place at once; the buttons stay for the rest.
    const lead = asksToGo(message) && actions.find((a) => NAVIGATING.has(a.type));
    if (lead) { setStatus(t('assistant.do.following')); setTimeout(() => { if (sheet) void runAction(lead); }, COMMAND_DELAY_MS + 400); }
  } catch (error) {
    history.pop();
    const code = error.code === 'RATE_LIMITED' ? 'limit' : error.code === 'UNAUTHENTICATED' ? 'signin' : error.code === 'ASSISTANT_UNAVAILABLE' ? 'unconfigured' : 'failed';
    typing.replaceWith(bubble('assistant', t(`assistant.error.${code}`)));
    mood('sorry', 'idle', 2600); setStatus('');
    if (sheet) sheet.querySelector('[data-xy-input]').value = message;
  } finally { busy = false; refreshComposer(); scrollEnd(); }
}

function scrollEnd() { const list = sheet?.querySelector('[data-xy-list]'); list?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }
function refreshComposer() {
  if (!sheet) return;
  const input = sheet.querySelector('[data-xy-input]');
  sheet.querySelector('[data-xy-send]').disabled = busy || !input.value.trim();
  sheet.querySelectorAll('[data-xy-chip],[data-xy-mic]').forEach((b) => { b.disabled = busy; });
}

function openChat({ voice = false } = {}) {
  if (!enabled()) return;
  if (sheet) { if (voice) focusVoice(); return; }
  const body = `
    <div class="xy-chat">
      <div class="xy-hello">
        <span class="xy-hello__art">${mascotSvg({ expression: 'happy', action: 'wave' })}</span>
        <p class="t-body">${te('assistant.hello')}</p>
      </div>
      <ol class="bubbles xy-list" data-xy-list aria-live="polite" aria-label="${te('assistant.conversation')}"></ol>
      <p class="t-small xy-status" data-xy-status role="status"></p>
      <div class="quick xy-chips" role="group" aria-label="${te('assistant.chips')}">${CHIPS.map((c) => `<button class="quick__item" type="button" data-xy-chip="${c}">${te(`assistant.chip.${c}`)}</button>`).join('')}</div>
      <div class="xy-voice" data-xy-voice hidden role="status">
        <span class="xy-voice__icon" aria-hidden="true">${MIC}</span>
        <div class="xy-voice__copy"><strong data-xy-voice-title></strong><span class="t-small" data-xy-voice-hint></span></div>
        <button class="btn btn--text btn--inline" type="button" data-xy-voice-done>${te('assistant.voice.done')}</button>
      </div>
      <form class="composer__row xy-composer" data-xy-form>
        <label class="sr-only" for="xy-input">${te('assistant.input')}</label>
        <textarea class="input xy-input" id="xy-input" data-xy-input rows="1" maxlength="1000" placeholder="${te('assistant.placeholder')}" enterkeyhint="send" data-autofocus></textarea>
        <button class="icon-btn xy-mic" type="button" data-xy-mic aria-label="${te('assistant.mic')}">${MIC}</button>
        <button class="composer__send" type="submit" data-xy-send aria-label="${te('assistant.send')}">${icon('send', { size: 20 })}</button>
      </form>
    </div>`;
  openSheet({ title: te('assistant.title'), body, onMount(panel) {
    sheet = panel; panel.classList.add('xy-sheet');
    const list = panel.querySelector('[data-xy-list]'), input = panel.querySelector('[data-xy-input]');
    for (const m of history) list.append(bubble(m.role, m.text));
    settle = createSettleSender({ send: () => { endVoiceCard(); send(input.value); }, isBusy: () => composing });
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; settle?.input(input.value); });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; settle.input(input.value); refreshComposer(); });
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(input.value); } });
    // Keyboard voice typing ends when the keyboard closes: send what was dictated.
    input.addEventListener('blur', () => { composing = false; if (settle?.flush(input.value)) endVoiceCard(); });
    panel.querySelector('[data-xy-voice-done]').addEventListener('click', () => {
      if (recognizer) { stopVoice(true); return; }
      if (!settle?.flush(input.value)) { settle?.disarm(); input.focus(); }
      endVoiceCard();
    });
    panel.querySelector('[data-xy-form]').addEventListener('submit', (event) => { event.preventDefault(); send(input.value); });
    panel.querySelectorAll('[data-xy-chip]').forEach((b) => b.addEventListener('click', () => {
      const kind = b.dataset.xyChip;
      if (kind === 'howto' && availability() !== 'ready') { history.push({ role: 'user', text: t('assistant.chip.howto') }, { role: 'assistant', text: localAnswer('howto') }); list.append(bubble('user', t('assistant.chip.howto')), bubble('assistant', localAnswer('howto'))); scrollEnd(); return; }
      send(t(`assistant.ask.${kind}`));
    }));
    // pointerdown keeps the input focused so the keyboard (and its mic) stays up while tapping.
    const mic = panel.querySelector('[data-xy-mic]');
    mic.addEventListener('pointerdown', (event) => { if (listenMode() === 'keyboard' && document.activeElement === input) event.preventDefault(); });
    mic.addEventListener('click', () => (recognizer ? stopVoice(true) : startVoice({ fromSheet: true })));
    const observer = new MutationObserver(() => { if (!panel.isConnected) { observer.disconnect(); sheet = null; settle?.disarm(); settle = null; stopVoice(false); host?.querySelector('.xy-fab')?.setAttribute('aria-expanded', 'false'); } });
    observer.observe(panel.parentElement, { childList: true });
    host?.querySelector('.xy-fab')?.setAttribute('aria-expanded', 'true');
    mood('happy', 'wave', 1800);
    refreshComposer();
    if (voice) focusVoice();
  } });
}

const MIC = '<svg class="icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/></svg>';

function showVoiceCard(mode, title = '') {
  const card = sheet?.querySelector('[data-xy-voice]'); if (!card) return;
  card.hidden = false; card.dataset.mode = mode;
  sheet.querySelector('[data-xy-voice-title]').textContent = title || t(mode === 'web' ? 'assistant.voice.listening' : 'assistant.voice.keyboard.title');
  sheet.querySelector('[data-xy-voice-hint]').textContent = t(mode === 'web' ? 'assistant.voice.browser' : 'assistant.voice.keyboard');
  sheet.querySelector('[data-xy-mic]')?.classList.add('is-on');
  sheet.querySelector('[data-xy-mic]')?.setAttribute('aria-pressed', 'true');
}
function endVoiceCard() {
  const card = sheet?.querySelector('[data-xy-voice]'); if (card) card.hidden = true;
  sheet?.querySelector('[data-xy-mic]')?.classList.remove('is-on');
  sheet?.querySelector('[data-xy-mic]')?.setAttribute('aria-pressed', 'false');
}

// Keyboard voice typing: focus the box so the soft keyboard (with its own mic key) opens,
// then send the dictated text once it settles. Works in the Android shell with no permissions.
function focusVoice(title) {
  if (!sheet) return;
  const input = sheet.querySelector('[data-xy-input]');
  input.focus({ preventScroll: true });
  // Some keyboards only open on a second focus after the sheet animation; nudge once.
  setTimeout(() => { if (sheet && document.activeElement !== input) input.focus({ preventScroll: true }); }, 380);
  input.setSelectionRange?.(input.value.length, input.value.length);
  settle?.arm(); showVoiceCard('keyboard', title); setStatus(''); mood('happy', 'listen');
}

// Long-press or the mic button. In-page recognition where it really works; keyboard otherwise.
function startVoice({ fromSheet = false } = {}) {
  if (!enabled()) return;
  if (!sheet) openChat();
  if (listenMode() === 'keyboard') { focusVoice(); return; }
  try {
    const rec = new Recognition();
    rec.lang = getLocale() === 'zh' ? 'zh-CN' : 'en-US';
    rec.interimResults = true; rec.continuous = !fromSheet; rec.maxAlternatives = 1;
    rec.sendOnEnd = fromSheet;
    let heard = false;
    rec.onstart = () => { showVoiceCard('web'); setStatus(''); mood('happy', 'listen'); };
    rec.onresult = (event) => {
      let text = '';
      for (const r of event.results) text += r[0].transcript;
      const input = sheet?.querySelector('[data-xy-input]');
      if (input) input.value = text.trim();
      heard = heard || !!text.trim();
      refreshComposer();
    };
    rec.onerror = (event) => {
      if (recognizer !== rec) return;
      recognizer = null;
      // Permission, device or service problems: switch to the keyboard for the rest of the session.
      if (HARD_SPEECH_ERRORS.has(event.error)) { recognitionFailed = true; focusVoice(t('assistant.voice.fallback')); return; }
      if (event.error !== 'aborted') { endVoiceCard(); setStatus(t(event.error === 'no-speech' ? 'assistant.voice.nospeech' : 'assistant.voice.failed')); mood('sorry', 'idle', 2000); }
    };
    rec.onend = () => {
      if (recognizer !== rec) return;
      recognizer = null; endVoiceCard();
      const input = sheet?.querySelector('[data-xy-input]');
      if (rec.sendOnEnd && heard && input?.value.trim()) send(input.value);
      else if (!heard) { setStatus(t('assistant.voice.nospeech')); mood('sorry', 'idle', 1600); }
    };
    recognizer = rec;
    rec.start();
  } catch { recognizer = null; recognitionFailed = true; focusVoice(t('assistant.voice.fallback')); }
}

function stopVoice(sendIt) {
  if (!recognizer) { if (!sendIt) { settle?.disarm(); endVoiceCard(); } return; }
  recognizer.sendOnEnd = sendIt;
  try { recognizer.stop(); } catch { recognizer = null; endVoiceCard(); }
  if (!sendIt) setStatus('');
}

export function initAssistant() {
  onSettingsChange((key) => { if (key === 'assistant' || key === 'senior') { host?.remove(); host = null; updateVisibility(); } });
  onLocaleChange(() => { host?.remove(); host = null; if (sheet) closeSheet(); updateVisibility(); });
  onSessionChange(() => { if (!getSession()) history.length = 0; });
  // The welcome overlay and the native map own the screen while they show.
  new MutationObserver(updateVisibility).observe(document.documentElement, { attributes: true, attributeFilter: ['data-native-map', 'data-nav'] });
  updateVisibility();
}

export function assistantRoute(route) { current = route || { name: 'trip' }; updateVisibility(); }
export function assistantIsOpen() { return !!sheet && sheetIsOpen(); }
