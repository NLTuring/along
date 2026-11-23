// Sky gradient system — follows destination local time and weather
// Dawn 05:30-07:00, Day 07:00-17:30, Dusk 17:30-19:00, Night 19:00-05:30

export const SKY_STATES = {
  dawn: { start: '#F5D9C8', end: '#A8C8E1', logoOpacity: 0.065 },
  day: { start: '#87CEEB', end: '#E0F6FF', logoOpacity: 0.065 },
  dusk: { start: '#FFB88C', end: '#9B6B9E', logoOpacity: 0.075 },
  night: { start: '#1A2332', end: '#0D1821', logoOpacity: 0.085 },
};

export function getSkyState(hour = new Date().getHours()) {
  if (hour >= 5.5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 17.5) return 'day';
  if (hour >= 17.5 && hour < 19) return 'dusk';
  return 'night';
}

export function initSky(container) {
  const state = getSkyState();
  const { start, end, logoOpacity } = SKY_STATES[state];
  
  container.style.setProperty('--sky-start', start);
  container.style.setProperty('--sky-end', end);
  container.style.setProperty('--logo-opacity', logoOpacity);
  container.dataset.sky = state;
  
  return state;
}

export function updateSkyGradient(container, angle = 180) {
  const start = container.style.getPropertyValue('--sky-start');
  const end = container.style.getPropertyValue('--sky-end');
  container.style.background = `linear-gradient(${angle}deg, ${start}, ${end})`;
}
