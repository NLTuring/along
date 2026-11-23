// InsTrip mobile — account bookings. This is the complete local history;
// the Trip tab intentionally keeps its smaller upcoming-card view.

import { te } from './i18n.js';
import { skyline } from './ui.js';
import { getSession } from './auth.js';
import { openLogin } from './login.js';
import { mountBookings } from './trip-booking.js';

export function renderOrders(root) {
  const session = getSession();
  root.innerHTML = `
    <section class="page page--tab page--orders">
      ${skyline()}
      <h1 class="t-title">${te('orders.title')}</h1>
      <p class="t-body page__sub">${te('orders.sub')}</p>
      <div class="bookings" data-bookings></div>
    </section>`;

  mountBookings(root, { all: true, title: 'orders.title', details: true });
  if (!session) {
    const host = root.querySelector('[data-bookings]');
    host.querySelector('[data-signin]')?.addEventListener('click', () => openLogin());
  }
}
