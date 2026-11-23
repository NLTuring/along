// InsTrip mobile — saved film previews in the account area.
// The video service is not connected; these are the on-phone film projects.

import { te, esc } from './i18n.js';
import { dateShort } from './format.js';
import { icon } from './icons.js';
import { skyline } from './ui.js';
import { getSession } from './auth.js';
import { openLogin } from './login.js';
import { listFilms } from './films.js';
import { go } from './router.js';

const TZ = 'Asia/Shanghai';

export function renderLibrary(root) {
  const session = getSession();
  const films = session ? listFilms(session.email) : [];
  root.innerHTML = `
    <section class="page page--tab page--library">
      ${skyline()}
      <h1 class="t-title">${te('library.title')}</h1>
      <p class="t-body page__sub">${te('library.sub')}</p>
      <div data-library></div>
    </section>`;

  const host = root.querySelector('[data-library]');
  if (!session) {
    host.innerHTML = `<p class="note t-small">${te('library.signin')}</p>
      <button class="btn btn--primary" data-signin>${te('you.signin')}</button>`;
    host.querySelector('[data-signin]').addEventListener('click', () => openLogin());
    return;
  }
  if (!films.length) {
    host.innerHTML = `<div class="empty">
      <div class="window window--frame empty__window" aria-hidden="true"></div>
      <h2 class="t-heading">${te('library.empty')}</h2>
      <p class="t-body">${te('library.empty.body')}</p>
      <button class="btn btn--primary" data-create>${te('library.create')}</button>
    </div>`;
    host.querySelector('[data-create]').addEventListener('click', () => go('studio'));
    return;
  }
  host.innerHTML = `<div class="rows card">
    ${films.map((film) => `<button class="row" data-film="${esc(film.id)}">
      <span class="row__icon">${icon('film')}</span>
      <span class="row__text"><strong>${te(`style.${film.styleId}`)}</strong><small>${te('library.meta', { n: film.shots.length, date: dateShort(new Date(film.createdAt), TZ) })}</small></span>
      ${icon('chevron', { size: 20 })}
    </button>`).join('')}
  </div>`;
  host.addEventListener('click', (event) => {
    const id = event.target.closest('[data-film]')?.dataset.film;
    if (id) go(`studio/${id}`);
  });
}
