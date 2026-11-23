// InsTrip mobile — Trip tab. One tab, several stages:
// A: no plan yet -> the arrival form; B: a plan exists -> the plan itself.
// In senior mode a plan is shown as Today: the next stop, the friend, a photo button.
// A booking, when there is one, sits near the top of every stage.

import { renderArrive } from './page-arrive.js';
import { renderPlan } from './page-plan.js';
import { renderToday } from './page-today.js';
import { loadPlan, clearPlan } from './plan.js';
import { t } from './i18n.js';
import { getSettings, toast } from './ui.js';
import { mountBookings } from './trip-booking.js';
import { go } from './router.js';

export function renderTrip(root, _param, fresh = null) {
  const plan = fresh || loadPlan();
  if (plan && getSettings().senior) {
    renderToday(root, plan);
  } else if (plan) {
    renderPlan(root, plan, {
      onRestart() {
        if (!clearPlan()) { toast(t('error.STORAGE')); return; }
        renderTrip(root);
      },
    });
  } else {
    renderArrive(root, { onBuilt: (built) => renderTrip(root, null, built) });
  }
  mountBookings(root);
  const mapButton = document.createElement('button');
  mapButton.className = 'btn btn--outline';
  mapButton.textContent = t('you.map');
  mapButton.addEventListener('click', () => go('map'));
  root.querySelector('.page')?.append(mapButton);
  // Lets app.js refresh anything it owns on the page (the skyline clock).
  document.dispatchEvent(new CustomEvent('instrip:rendered'));
}
