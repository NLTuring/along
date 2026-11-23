// Along — account-scoped local records; only versioned meshes carry generated status.
import { t, te, esc } from './i18n.js';
import { dateLong } from './format.js';
import { icon } from './icons.js';
import { skyline } from './ui.js';
import { go, back } from './router.js';
import { getSession } from './auth.js';
import { openLogin } from './login.js';
import { listCrafts } from './crafts.js';
import { getMedia, urlFor } from './media.js';

export function renderCrafts(root) {
  const session = getSession();
  const crafts = session ? listCrafts(session.email) : [];
  let disposed = false;
  root.innerHTML = `<section class="page page--tab page--crafts">
    ${skyline()}
    <button class="btn btn--text btn--inline" data-back>${icon('back', { size: 18 })}${te('common.back')}</button>
    <h1 class="t-title">${te('craft.library.title')}</h1>
    <p class="t-body page__sub">${te('craft3d.library.sub')}</p>
    ${!session ? `<p class="note t-small">${te('craft.signin')}</p><button class="btn btn--primary" data-signin>${te('you.signin')}</button>` : `
      <button class="btn btn--primary" data-create>${te('craft.create')}</button>
      ${crafts.length ? `<div class="stack">${crafts.map((craft) => `<article class="card craft-library-card">
        <button class="row" data-craft="${esc(craft.id)}">
          <span class="window craft-library-card__photo" data-cover="${esc(craft.id)}" aria-hidden="true">${icon('craft')}</span>
          <span class="row__text"><strong>${te(`product.${craft.product}`)}</strong><small>${te(`shape.${craft.shape}`)}</small><small>${esc(craft.demoEdition)}</small><small>${esc(dateLong(new Date(craft.createdAt), 'Asia/Shanghai'))}</small></span>
          ${icon('chevron', { size: 20 })}
        </button>
        <p class="t-small"><span class="stamp ${craft.modelStatus === 'GENERATED' ? 'stamp--ok' : 'stamp--pending'}">${te(craft.modelStatus === 'GENERATED' ? 'craft3d.status.generated' : craft.status === 'DESIGNED' ? 'craft3d.status.legacy' : 'craft3d.status.draft')}</span></p>
        <p class="t-small">${te(craft.variant === 'ANIME' ? 'craft3d.variant.anime' : 'craft3d.variant.real')} · ${te('craft3d.dimensions', { w: craft.widthMm, h: craft.heightMm, b: craft.baseMm, r: craft.reliefMm })}</p>
      </article>`).join('')}</div>` : `<div class="empty"><div class="window window--frame empty__window" aria-hidden="true"></div><h2 class="t-heading">${te('craft.library.empty')}</h2><p class="t-body">${te('craft.library.empty.body')}</p></div>`}
    `}
    <p class="note t-small">${te('craft3d.files.note')}</p>
  </section>`;
  root.querySelector('[data-back]').addEventListener('click', () => back('you'));
  root.querySelector('[data-signin]')?.addEventListener('click', () => openLogin());
  root.querySelector('[data-create]')?.addEventListener('click', () => go('craft/new'));
  const page = root.querySelector('.page--crafts');
  page.addEventListener('click', (event) => {
    const id = event.target.closest('[data-craft]')?.dataset.craft;
    if (id) go(`craft/${id}`);
  });
  Promise.all(crafts.map(async (craft) => {
    try {
      const item = await getMedia(craft.mediaId);
      if (disposed || !item) return;
      const cover = page.querySelector(`[data-cover="${CSS.escape(craft.id)}"]`);
      if (cover) cover.innerHTML = `<img src="${esc(urlFor(item))}" alt="" loading="lazy" />`;
    } catch { /* A missing thumbnail does not block the saved record. */ }
  }));
  return () => { disposed = true; };
}
