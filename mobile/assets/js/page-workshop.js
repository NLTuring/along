// Along — the craft workshop home. A workbench of four things to make (photo keepsake, perler
// beads, hand-pinched clay, the shared gallery), the points pouch, and the traveller's own
// clay projects. Drawn like paper labels on a bench, not app tiles.
import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { go, back } from './router.js';
import { getSession, onSessionChange } from './auth.js';
import { openLogin } from './login.js';
import { loadPoints, pointsMode, PRICES, MONTHLY_GRANT, onPointsChange } from './points.js';
import { listProjects } from './clay-projects.js';
import { dateText } from './community-ui.js';

const BENCH = [
  { key: 'keepsake', route: 'craft/new', icon: 'craft', price: PRICES.MAGNET, tone: 'terracotta' },
  { key: 'beads', route: 'beads', icon: 'beads', price: PRICES.BEADS, tone: 'sage' },
  { key: 'clay', route: 'clay/new', icon: 'clay', price: 0, tone: 'clay' },
  { key: 'gallery', route: 'gallery', icon: 'gallery', price: null, tone: 'ink' },
];
// Everything the traveller has made or ordered here, in one list instead of separate "You" pages.
const DESK = [
  ['crafts', 'craft', 'keepsakes'],
  ['gallery/mine', 'gallery', 'gallery'],
  ['make-orders', 'truck', 'production'],
  ['beads/orders', 'beads', 'beadOrders'],
  ['points', 'coin', 'points'],
];

export function renderWorkshop(root) {
  let disposed = false;
  const paint = () => {
    const session = getSession();
    root.innerHTML = `<section class="page page--tab workshop">
      <header class="workshop__head">
        <button class="btn btn--text btn--inline" data-back>${icon('back', { size: 18 })}${te('common.back')}</button>
        <p class="workshop__eyebrow">${te('workshop.eyebrow')}</p>
        <h1 class="t-title workshop__title">${te('workshop.title')}</h1>
        <p class="t-body">${te('workshop.sub')}</p>
      </header>
      <button class="pouch" data-route="points" aria-label="${te('workshop.pouch.label')}">
        <span class="pouch__coin" aria-hidden="true">${icon('coin', { size: 28 })}</span>
        <span class="pouch__text"><strong data-balance>${session ? '…' : te('workshop.pouch.guest')}</strong><small>${te('workshop.pouch.grant', { n: MONTHLY_GRANT })}</small></span>
        <span class="pouch__go">${te('workshop.pouch.go')}${icon('chevron', { size: 18 })}</span>
      </button>
      <ol class="bench" aria-label="${te('workshop.bench')}">
        ${BENCH.map((item, i) => `<li class="bench__item bench__item--${item.tone}" style="--tilt:${[-1.2, 0.8, -0.6, 1.1][i]}deg">
          <button class="bench__card" data-route="${item.route}">
            <span class="bench__num t-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="bench__icon" aria-hidden="true">${icon(item.icon, { size: 34 })}</span>
            <strong class="bench__name">${te(`workshop.${item.key}.name`)}</strong>
            <span class="bench__desc">${te(`workshop.${item.key}.desc`)}</span>
            <span class="bench__price">${item.price === null ? te('workshop.gallery.price') : item.price ? te('workshop.price', { n: item.price }) : te('workshop.free')}</span>
          </button>
        </li>`).join('')}
      </ol>
      <section class="workshop__mine" data-mine>
        <h2 class="t-heading">${te('workshop.mine.title')}</h2>
        <div data-projects>${session ? `<p class="t-small">${te('community.loading')}</p>` : `<p class="t-small">${te('workshop.mine.signin')}</p><button class="btn btn--outline" data-signin>${te('you.signin')}</button>`}</div>
      </section>
      <section class="workshop__mine">
        <h2 class="t-heading">${te('workshop.desk.title')}</h2>
        <div class="rows card workshop__desk">${DESK.map(([route, name, key]) => `<button class="row" data-route="${route}">
          <span class="row__icon">${icon(name)}</span>
          <span class="row__text"><strong>${te(`workshop.desk.${key}`)}</strong><small>${te(`workshop.desk.${key}.sub`)}</small></span>
          ${icon('chevron', { size: 20 })}
        </button>`).join('')}</div>
      </section>
      <p class="note t-small workshop__credit">${te('workshop.credit')}</p>
    </section>`;
    root.querySelector('[data-back]').onclick = () => back('trip');
    root.querySelector('[data-signin]')?.addEventListener('click', () => openLogin());
    if (!session) return;
    loadPoints().then((state) => { if (!disposed) setBalance(state.balance); }).catch(() => { if (!disposed) setBalance(null); });
    listProjects(session.id || session.email).then((items) => {
      if (disposed) return;
      const host = root.querySelector('[data-projects]');
      host.innerHTML = items.length ? `<ul class="clay-shelf">${items.slice(0, 8).map((p) => `<li><button class="clay-shelf__item" data-route="clay/${esc(p.id)}">
        ${p.thumb ? `<img src="${esc(p.thumb)}" alt="" />` : `<span class="clay-shelf__blank" aria-hidden="true">${icon('clay', { size: 30 })}</span>`}
        <span class="clay-shelf__name">${esc(p.title || t('clay.untitled'))}</span><small>${esc(dateText(p.updatedAt))}</small></button></li>`).join('')}</ul>`
        : `<p class="t-small">${te('workshop.mine.empty')}</p>`;
    }).catch(() => { if (!disposed) root.querySelector('[data-projects]').innerHTML = `<p class="t-small">${te('error.STORAGE')}</p>`; });
  };
  const setBalance = (balance) => {
    const node = root.querySelector('[data-balance]');
    if (node) node.textContent = balance == null ? t('workshop.pouch.offline') : t(pointsMode() === 'local' ? 'workshop.pouch.local' : 'workshop.pouch.balance', { n: balance });
  };
  // The app root is shared by every page: listeners must leave with this page.
  const click = (event) => {
    const route = event.target.closest('[data-route]')?.dataset.route;
    if (route) go(route);
  };
  root.addEventListener('click', click);
  paint();
  const offSession = onSessionChange(() => { if (!disposed) paint(); });
  const offPoints = onPointsChange((balance) => { if (!disposed) setBalance(balance); });
  return () => { disposed = true; root.removeEventListener('click', click); offSession(); offPoints(); };
}
