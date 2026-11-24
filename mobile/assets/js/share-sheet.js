// InsTrip mobile — sharing a film (spec §6.12).
// There is no video file yet (no render service), so what can actually leave
// the phone is the caption. The sheet says so. The copied text, caption plus
// the fixed hashtags, is held to 220 characters.
// A visitor from abroad is sent to TikTok. A traveller who lives in China gets the phone's own
// share sheet instead, which lists whatever apps are installed.

import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { openSheet, toast } from './ui.js';
import { isDomestic } from './audience.js';

export const MAX_SHARE = 220;
const TIKTOK_URL = 'https://www.tiktok.com/';
// Fixed by the product demo.
export const hashtags = () => (isDomestic() ? '#旅行 #Along' : '#ChinaTravel #Along');
const maxCaption = () => MAX_SHARE - hashtags().length - 1;

// Caption plus the fixed hashtags, never longer than MAX_SHARE: the caption is
// cut to fit (the maxlength attribute only limits typing, not pasted or set text).
export const shareText = (caption) => `${String(caption).trim().slice(0, maxCaption()).trim()} ${hashtags()}`.trim();

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// The phone's own share sheet (the app shell's, or the browser's). Without one the text is copied.
async function shareOut(text) {
  try {
    if (window.Android?.shareText) { window.Android.shareText(text); return; }
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (error) {
    if (error?.name === 'AbortError') return; // the share sheet was closed without choosing an app
  }
  toast(t((await copy(text)) ? 'share.copied' : 'share.novideo'));
}

// onPublish(caption): post the film's photos as a story on Along (opens the composer prefilled).
export function openShare(film, coverUrl, { onPublish = null } = {}) {
  const domestic = isDomestic();
  const max = maxCaption();
  const outside = onPublish ? 'btn--outline' : 'btn--primary';
  openSheet({
    title: te('share.title'),
    body: `
      <div class="share">
        <div class="polaroid" data-card>
          <div class="polaroid__face polaroid__front">
            ${coverUrl ? `<img src="${esc(coverUrl)}" alt="" />` : '<div class="polaroid__blank"></div>'}
            <p class="polaroid__line"><strong>${te(`style.${film.styleId}`)}</strong> <span class="t-num">${te('share.duration', { n: film.duration })}</span></p>
          </div>
          <div class="polaroid__face polaroid__back">
            <label class="sr-only" for="share-back">${te('share.back.label')}</label>
            <textarea id="share-back" class="polaroid__note" maxlength="80" rows="3" placeholder="${te('share.back.label')}"></textarea>
            <p class="polaroid__brand">${te('brand')}</p>
          </div>
        </div>
        <button class="btn btn--text" type="button" data-flip aria-pressed="false">${icon('flip', { size: 20 })}<span>${te('share.flip')}</span></button>

        <label class="field"><span class="t-label">${te('share.caption')}</span>
          <textarea class="input input--area" rows="4" maxlength="${max}" data-caption data-autofocus aria-describedby="share-count">${esc(t('share.caption.default').slice(0, max))}</textarea></label>
        <div class="share__meta">
          <p class="t-body t-ink">${esc(hashtags())}</p>
          <p class="t-small t-num" id="share-count" data-count></p>
        </div>

        ${onPublish ? `<button class="btn btn--primary" data-publish data-track="share_along">${te('share.along')}</button><p class="t-small">${te('share.along.note')}</p>` : ''}
        ${domestic
          ? `<button class="btn ${outside}" data-system data-track="share_click">${te('share.system')}</button>`
          : `<button class="btn ${outside}" data-tiktok data-track="share_click">${te('share.tiktok')}</button>`}
        <button class="btn btn--outline" data-copy data-track="caption_copy">${te('share.copy')}</button>
        <p class="note t-small">${te('share.novideo')}</p>
        ${domestic ? '' : `<p class="t-small">${te('share.note')}</p>`}
      </div>`,
    onMount(panel) {
      const caption = panel.querySelector('[data-caption]');
      const count = panel.querySelector('[data-count]');
      const card = panel.querySelector('[data-card]');
      const flip = panel.querySelector('[data-flip]');
      const paint = () => {
        if (caption.value.length > max) caption.value = caption.value.slice(0, max);
        count.textContent = t('share.count', { n: shareText(caption.value).length, max: MAX_SHARE });
      };
      caption.addEventListener('input', paint);

      // The card turns over, like the photo cards in the old app: cover on the
      // front, a line of your own on the back. Only the visible side takes focus.
      const back = panel.querySelector('.polaroid__back');
      back.inert = true;
      flip.addEventListener('click', () => {
        const on = !card.classList.contains('is-flipped');
        card.classList.toggle('is-flipped', on);
        flip.setAttribute('aria-pressed', String(on));
        back.inert = !on;
        if (on) panel.querySelector('#share-back').focus();
      });

      panel.querySelector('[data-publish]')?.addEventListener('click', () => onPublish(caption.value.trim()));
      panel.querySelector('[data-copy]').addEventListener('click', async () => {
        toast(t((await copy(shareText(caption.value))) ? 'share.copied' : 'share.novideo'));
      });
      panel.querySelector('[data-system]')?.addEventListener('click', () => shareOut(shareText(caption.value)));
      panel.querySelector('[data-tiktok]')?.addEventListener('click', async () => {
        if (await copy(shareText(caption.value))) toast(t('share.copied'));
        if (window.Android?.openExternal) window.Android.openExternal(TIKTOK_URL);
        else window.open(TIKTOK_URL, '_blank', 'noopener');
      });
      paint();
    },
  });
}
