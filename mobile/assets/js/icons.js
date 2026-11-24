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
  bowl: '<path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z"/><path d="M9 8c0-1.4 1-1.8 1-3.2M13.5 8c0-1.4 1-1.8 1-3.2"/>',
  bed: '<path d="M3 18.5V6.5M3 14h18v4.5M21 14v-1.5a3 3 0 0 0-3-3h-7.5V14"/><circle cx="6.8" cy="11.2" r="1.7"/>',
  // Workshop: drawn like tools on a bench, not glowing symbols.
  clay: '<path d="M5 17.5c-1.6-1-1.9-3.6-.6-5.4 1-1.4 1.5-3.6 3.6-4.4 2.2-.9 3.3.6 5.3.1 2.3-.6 4.6.8 5.3 3.1.8 2.6-.3 4.9-2.3 6.1-2.9 1.7-8.4 1.8-11.3.5z"/><path d="M9 12.5c.8.6 2 .7 2.9.2"/>',
  beads: '<circle cx="7" cy="7" r="2.3"/><circle cx="12" cy="7" r="2.3"/><circle cx="17" cy="7" r="2.3"/><circle cx="7" cy="12" r="2.3"/><circle cx="12" cy="12" r="2.3"/><circle cx="7" cy="17" r="2.3"/><circle cx="7" cy="7" r=".5"/><circle cx="12" cy="12" r=".5"/>',
  gallery: '<path d="M4.5 19.5V9l7.5-5 7.5 5v10.5z"/><path d="M8 19.5v-6h3v6M13.5 13h3v3h-3z"/>',
  coin: '<ellipse cx="12" cy="12" rx="7.5" ry="7.5"/><path d="M9.5 9.5l2.5 3 2.5-3M12 12.5v4M9.8 14h4.4"/>',
  undo: '<path d="M8.5 7L4.5 11l4 4"/><path d="M4.8 11H14a5 5 0 0 1 0 10h-2"/>',
  redo: '<path d="M15.5 7l4 4-4 4"/><path d="M19.2 11H10a5 5 0 0 0 0 10h2"/>',
  'brush-build': '<path d="M5 18.5c2-.2 3-1.6 3-3.4"/><path d="M8.2 14.8c1.4-2.6 4.5-3.7 7.3-2.6"/><circle cx="16.5" cy="9" r="3.2"/><path d="M16.5 7.6v2.8M15.1 9h2.8"/>',
  'brush-dig': '<path d="M4.5 9.5c3 4 12 4 15 0"/><path d="M8 13.4l-1.3 2.4M12 14.4v2.6M16 13.4l1.3 2.4"/>',
  'brush-smooth': '<path d="M3.5 14c2.5-3 4.5-3 7 0s4.5 3 7 0 2.5-1.5 3-1.5"/><path d="M5 18.5h14"/>',
  'brush-flatten': '<rect x="6" y="5" width="12" height="5" rx="1.5"/><path d="M12 10v3.5M4 17.5h16"/>',
  'brush-grab': '<path d="M8 13V7.5a1.5 1.5 0 0 1 3 0V12M11 11V6a1.5 1.5 0 0 1 3 0v5M14 11V7.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4.3-2.5L4.8 15a1.5 1.5 0 0 1 2.6-1.5L8 14.5"/>',
  'brush-crease': '<path d="M15.5 4.5l4 4-9.5 9.5H6v-4z"/><path d="M4 20.5h6"/>',
  mirror: '<path d="M12 3.5v17"/><path d="M9 7.5L4.5 12 9 16.5zM15 7.5l4.5 4.5-4.5 4.5z"/>',
  wheel: '<ellipse cx="12" cy="16.5" rx="8" ry="2.8"/><path d="M8 16c0-4 1.2-7.5 4-11 2.8 3.5 4 7 4 11"/>',
  hand: '<path d="M12 4.5a7.5 7.5 0 1 1-7.3 9.3"/><path d="M4 9.5l.7 4.3 4.2-1.2"/>',
  photo: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M3.5 15.5l4.5-4 4 3.5 3-2.5 5.5 4.5"/><circle cx="15.5" cy="9.5" r="1.4"/>',
  spark: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2.2 2.2M14.8 14.8L17 17M17 7l-2.2 2.2M9.2 14.8L7 17"/>',
  download: '<path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
  upload: '<path d="M12 15V5M7.5 9.5L12 5l4.5 4.5"/><path d="M5 19.5h14"/>',
  remix: '<path d="M5 8h9.5a4 4 0 0 1 0 8H9"/><path d="M8 5L5 8l3 3M12 13l-3 3 3 3"/>',
  truck: '<path d="M3.5 7.5h10v8h-10zM13.5 10.5h4l3 3v2h-7"/><circle cx="7.5" cy="17.5" r="1.7"/><circle cx="17" cy="17.5" r="1.7"/>',
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
