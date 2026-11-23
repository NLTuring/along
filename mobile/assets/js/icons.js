// InsTrip mobile — icons. One 24px grid, 1.6px round strokes, no fills.

const PATHS = {
  trip: '<path d="M4 18.5c3-1 4.5-4 7-4s3 2.5 5.5 2.5S20 15 20 15"/><path d="M12 14.5V5l5 2.2-5 2.3"/>',
  friends: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.2 2.7-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="8" r="2.4"/><path d="M16.5 13.2c2.2.2 3.6 1.7 4 4.3"/>',
  stories: '<rect x="4" y="4.5" width="16" height="15" rx="3"/><path d="M4.5 15.5l4-4 3.5 3.5 2.5-2.5 5 5"/><circle cx="15" cy="9" r="1.4"/>',
  you: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.8 3.4-6 7-6s6.2 2.2 7 6"/>',
  message: '<path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3v-3H5A1.5 1.5 0 0 1 3.5 16V8A1.5 1.5 0 0 1 5 6.5z"/>',
  camera: '<path d="M4.5 8.5h3l1.4-2.2h6.2l1.4 2.2h3A1.5 1.5 0 0 1 21 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5V10a1.5 1.5 0 0 1 1.5-1.5z"/><circle cx="12" cy="13.5" r="3.4"/>',
  film: '<rect x="6.5" y="3.5" width="11" height="17" rx="2.5"/><path d="M10.5 9.5l4 2.5-4 2.5z"/>',
  craft: '<path d="M12 3.5l7 3.8v8.4l-7 3.8-7-3.8V7.3z"/><path d="M5.3 7.5L12 11l6.7-3.5M12 11v8.3"/>',
  pen: '<path d="M5 19l1-4L16.5 4.5a1.8 1.8 0 0 1 2.6 0l.4.4a1.8 1.8 0 0 1 0 2.6L9 18z"/><path d="M14.5 6.5l3 3"/>',
  chevron: '<path d="M9.5 6l6 6-6 6"/>',
  back: '<path d="M14.5 6l-6 6 6 6"/>',
  play: '<path d="M8 5.5l10.5 6.5L8 18.5z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  flip: '<path d="M4.5 9.5a8 8 0 0 1 14-2.5M19.5 14.5a8 8 0 0 1-14 2.5"/><path d="M18.5 3.5V7H15M5.5 20.5V17H9"/>',
  trash: '<path d="M5 7.5h14M9.5 7.5v-2h5v2M7 7.5l.8 11a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4l.8-11"/>',
  send: '<path d="M4.5 12l15-7-5.5 15-2.7-6.3z"/><path d="M11.3 13.7L19.5 5"/>',
  phone: '<path d="M6.5 4.5h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 5 6.1a1.5 1.5 0 0 1 1.5-1.6z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.2"/><path d="M4 7l8 6 8-6"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="M5.5 12.5l4.2 4.2 8.8-9.2"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5z"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  star: '<path d="M12 4.2l2.3 4.8 5.2.7-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 9.7l5.2-.7z"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.9"/><path d="M12 16.9v.1"/>',
  heart: '<path d="M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4z"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  pin: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  locate: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.6"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8"/>',
  userplus: '<circle cx="10" cy="8.5" r="3.4"/><path d="M3.5 20c.7-3.6 3.1-5.6 6.5-5.6 1.6 0 3 .5 4.1 1.3"/><path d="M18 14v6M15 17h6"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5l4 4"/>',
};

export function icon(name, { size = 24, label } = {}) {
  const body = PATHS[name];
  if (!body) {
    console.warn(`[icons] unknown icon: ${name}`);
    return '';
  }
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`;
}
