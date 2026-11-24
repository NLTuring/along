// Along mobile — meals and nights for a plan. Pure: reads a plan and the seed in seed-food.js,
// returns what to show; the pages draw it. No network.
// Meals: for each plan day, a lunch and a dinner, nearest to that day's stops first, filtered
// by the traveller's diet. Nights: for each night, the stay area handiest for the next day.
// Money: the sample plan's stops are summed with a meal and a night estimate per day, so the
// day's total is honest about what it leaves out.

import { RESTAURANTS, DISHES, STAY_AREAS, STAY_TIERS, MEAL_STOPS, DIETS } from './seed-food.js';
import { FX_CNY_PER_USD } from './format.js';

export const DIET_IDS = DIETS.map((d) => d.id);
const DIET_KEY = 'along.diet.v1';
const TIER_KEY = 'along.stayTier.v1';

// Which dish flags each diet rules out. 'ask' never rules a dish out: it is shown with a warning.
const BLOCKS = {
  halal: ['pork'],
  vegetarian: ['meat', 'pork', 'seafood'],
  noPork: ['pork'],
  noSeafood: ['seafood'],
  peanut: ['peanut'],
  gluten: [],
  noSpicy: ['spicy'],
};

// Diets that are about the whole kitchen, not just the dish: a halal or vegetarian traveller
// can be sure only in a kitchen that is halal or vegetarian (shared woks, lard, meat stock).
const KITCHEN_DIETS = ['halal', 'vegetarian'];

// Allergies the seed cannot rule out from a dish name: cooking oil, soy sauce and seitan are not
// recorded, so these always mean asking the staff.
const ALWAYS_ASK = ['peanut', 'gluten'];

// -> 'ok' | 'ask' | 'no' for one dish under a set of diets, before the kitchen is considered.
// A dish whose recipe varies ('ask') is never promised safe.
export function dishFit(dish, diets = []) {
  const flags = dish.flags || [];
  if (diets.some((d) => (BLOCKS[d] || []).some((flag) => flags.includes(flag)))) return 'no';
  if (!diets.length) return 'ok';
  return flags.includes('ask') || diets.some((d) => ALWAYS_ASK.includes(d)) ? 'ask' : 'ok';
}

// -> { fit: 'ok' | 'ask' | 'no', kitchen: boolean, dishes: [{ ...dish, fit }] } for one restaurant.
// Halal: only a halal kitchen is recommended outright. A vegetarian kitchen has no meat, so its
// dishes are 'ask' (cooking wine is common); any other kitchen is left out. Vegetarian: the
// vegetable dishes of an ordinary kitchen are 'ask' (shared woks, lard, meat stock).
// The restaurant is 'ok' when at least one dish is a sure fit, 'ask' when every usable dish
// needs asking. `kitchen` is true when the kitchen itself matches every such diet.
export function restaurantFit(restaurant, diets = []) {
  const needs = diets.filter((d) => KITCHEN_DIETS.includes(d));
  const own = (d) => restaurant.diets.includes(d);
  const dishes = restaurant.dishes.map((dish) => {
    let fit = dishFit(dish, diets);
    for (const need of needs) {
      if (fit === 'no' || own(need)) continue;
      if (need === 'halal') fit = own('vegetarian') ? 'ask' : 'no';
      else fit = 'ask';
    }
    return { ...dish, fit };
  });
  const kitchen = needs.length > 0 && needs.every(own);
  const usable = dishes.filter((d) => d.fit !== 'no');
  if (!usable.length) return { fit: 'no', kitchen, dishes };
  return { fit: usable.some((d) => d.fit === 'ok') ? 'ok' : 'ask', kitchen, dishes };
}

// True when a diet that depends on the kitchen (halal, vegetarian) has no matching kitchen among
// the city's verified restaurants: the page then says so and points to a map search instead.
export function kitchenGap(citySlug, diets = []) {
  return diets.filter((d) => KITCHEN_DIETS.includes(d))
    .filter((d) => !RESTAURANTS.some((r) => r.citySlug === citySlug && r.diets.includes(d)));
}

// The places a plan day goes to, for ranking restaurants by closeness.
const dayStops = (day) => (day?.stops || []).map((s) => s.poiId);

// Restaurants for a day: in its city, the diet allows something, nearest first
// (one near a stop of the day before a chain or a city-wide pick), halal/vegetarian kitchens
// first for those diets. A day that already eats at a meal stop keeps that meal.
export function mealsFor(day, diets = []) {
  if (!day) return [];
  const stops = dayStops(day);
  const ranked = RESTAURANTS.filter((r) => r.citySlug === day.citySlug)
    .map((r) => ({ restaurant: r, ...restaurantFit(r, diets) }))
    .filter((r) => r.fit !== 'no')
    .map((r) => ({ ...r, nearStop: r.restaurant.near && stops.includes(r.restaurant.near) ? r.restaurant.near : null }))
    // Ties go to the cheaper place, then a fixed order, so the same day always reads the same.
    .sort((a, b) => score(b) - score(a) || a.restaurant.tier - b.restaurant.tier || a.restaurant.id.localeCompare(b.restaurant.id));
  return ranked;
}
function score(item) {
  let s = 0;
  if (item.nearStop) s += 4;
  if (item.kitchen) s += 3;
  if (item.fit === 'ok') s += 2;
  if (item.restaurant.chain) s += 1; // a chain has a branch near wherever you are
  return s;
}

// A meal is lunch when it starts 11:00–15:00 and dinner when it starts 17:00–21:00.
const SLOT_HOURS = { lunch: ['11:00', '15:00'], dinner: ['17:00', '21:00'] };
export const MEAL_SLOTS = Object.keys(SLOT_HOURS);

// The plan stop that already is this meal (dinner in Jing'an, snacks through Laomendong), or null.
export function mealStopFor(day, slot) {
  const [from, to] = SLOT_HOURS[slot];
  return day?.stops.find((s) => MEAL_STOPS.includes(s.poiId) && s.startTime >= from && s.startTime < to) || null;
}

// The meal slots a day leaves open: those not already taken by a meal stop.
export function mealSlots(day) {
  if (!day) return [];
  return MEAL_SLOTS.filter((slot) => !mealStopFor(day, slot));
}

// -> [{ slot, item }] pairing each open slot with a different restaurant where possible.
// Lunch and dinner go to different restaurants while there are enough that fit. When only one
// fits, both meals name it and `repeat` marks the second, so the page can say there is no other
// checked choice rather than look like an oversight.
export function mealPlan(day, diets = []) {
  const list = mealsFor(day, diets);
  return mealSlots(day).map((slot, i) => {
    const item = list[i] || list[0] || null;
    return { slot, item, repeat: !!item && i > 0 && !list[i] };
  });
}

// The city's dishes worth a trip, judged like a restaurant's: a dish with meat is halal only from
// a halal kitchen, and a vegetarian dish is sure only from a vegetarian one. A dish sold all over
// the city (no `at`) has no kitchen to vouch for it, so those diets always ask.
export function cityDishes(citySlug, diets = []) {
  const needs = diets.filter((d) => KITCHEN_DIETS.includes(d));
  return DISHES.filter((d) => d.citySlug === citySlug).map((dish) => {
    let fit = dishFit(dish, diets);
    const kitchens = dish.at.map((id) => RESTAURANTS.find((r) => r.id === id)).filter(Boolean);
    for (const need of needs) {
      if (fit === 'no' || (kitchens.length && kitchens.every((r) => r.diets.includes(need)))) continue;
      fit = need === 'halal' && (dish.flags || []).includes('meat') ? 'no' : 'ask';
    }
    return { ...dish, fit };
  });
}

// The nights of a plan, one before each planned day: night 0 is the arrival evening, night n
// the evening of day n. A night is spent where that evening ends (the arrival night: where day 1
// starts), in the area nearest that evening's stops and, when it is the same city, the next
// morning's. When the next day is in another city, `move` says so, so the page can warn about
// checking out with the luggage or an early train. Days after the last planned day get no night.
export function nightsFor(plan) {
  if (!plan) return [];
  const nights = [];
  for (let n = 0; n < plan.daysData.length; n += 1) {
    const evening = n > 0 ? plan.daysData[n - 1] : null;
    const next = plan.daysData[n];
    const city = evening ? evening.citySlug : next.citySlug;
    const stops = [...dayStops(evening), ...(next.citySlug === city ? dayStops(next) : [])];
    const areas = STAY_AREAS.filter((a) => a.citySlug === city)
      .map((a) => ({ area: a, hits: a.near.filter((id) => stops.includes(id)) }))
      .sort((a, b) => b.hits.length - a.hits.length || STAY_AREAS.indexOf(a.area) - STAY_AREAS.indexOf(b.area));
    if (!areas.length) continue;
    nights.push({
      night: n,
      city,
      area: areas[0].area,
      nearStops: areas[0].hits,
      others: areas.slice(1).map((a) => a.area),
      nextDay: n,
      move: next.citySlug !== city ? { from: city, to: next.citySlug } : null,
    });
  }
  return nights;
}

// A city change between two planned days means checking out and moving that morning.
export function cityChanges(plan) {
  const out = [];
  for (let n = 1; n < (plan?.daysData.length || 0); n += 1) {
    if (plan.daysData[n].citySlug !== plan.daysData[n - 1].citySlug) out.push({ dayIndex: n, from: plan.daysData[n - 1].citySlug, to: plan.daysData[n].citySlug });
  }
  return out;
}

// Rough cost per person of one meal at each price tier, in yuan. A guide written for this demo,
// never a quote: the restaurants' own prices could not be confirmed.
export const MEAL_CNY = { 1: [25, 50], 2: [80, 150], 3: [180, 350] };

const usdCentsToYuan = (cents) => Math.round((cents / 100) * FX_CNY_PER_USD);
export const cnyToUsdCents = (yuan) => Math.round((yuan * 100) / FX_CNY_PER_USD);

// The night spent after a plan day (the evening of day n is night n + 1); null on the last day.
export const nightAfter = (plan, dayIndex) => nightsFor(plan).find((n) => n.night === dayIndex + 1) || null;

// What one plan day costs, in yuan ranges: the day's tickets (exact, from the plan), its open
// meals by tier, and the night after it in the chosen stay tier. `budget` compares the day
// without the night with the traveller's daily budget, which the arrival form asks for
// "not counting your hotel".
export function dayCost(plan, dayIndex, { tier = 'comfort', diets = [] } = {}) {
  const day = plan?.daysData[dayIndex];
  if (!day) return null;
  const tickets = usdCentsToYuan(day.stops.reduce((sum, stop) => sum + stop.costCents, 0));
  const meals = mealPlan(day, diets).reduce((sum, { item }) => {
    const [lo, hi] = MEAL_CNY[item?.restaurant.tier || 2];
    return [sum[0] + lo, sum[1] + hi];
  }, [0, 0]);
  const area = nightAfter(plan, dayIndex)?.area || null;
  const night = area ? area.nightlyCny[tier] : [0, 0];
  const withoutNight = [tickets + meals[0], tickets + meals[1]];
  // A yuan budget is compared as typed; a dollar budget at the reference rate.
  const budget = !Number.isSafeInteger(plan.budgetCents) ? null
    : Number.isSafeInteger(plan.budgetYuan) ? plan.budgetYuan : usdCentsToYuan(plan.budgetCents);
  return {
    tickets, meals, night, hasNight: !!area,
    total: [withoutNight[0] + night[0], withoutNight[1] + night[1]],
    budget,
    // 'within' only when even the high end fits; 'over' when even the low end does not.
    budgetFit: budget == null ? null : withoutNight[1] <= budget ? 'within' : withoutNight[0] > budget ? 'over' : 'maybe',
  };
}

// What the traveller avoids and the hotel type they want, kept on this phone. Unknown values are
// dropped. A choice that cannot be saved still holds until the app is closed (set returns false).
export function createPrefs({ storage = () => globalThis.localStorage } = {}) {
  const memo = {};
  const read = (key, ok, fallback) => {
    if (key in memo) return memo[key];
    try {
      const value = JSON.parse(storage()?.getItem(key) || 'null');
      return ok(value) ? value : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    memo[key] = value;
    try { storage().setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  };
  return {
    diets: () => read(DIET_KEY, Array.isArray, []).filter((d) => DIET_IDS.includes(d)),
    setDiets: (list) => write(DIET_KEY, [...new Set((Array.isArray(list) ? list : []).filter((d) => DIET_IDS.includes(d)))]),
    tier: () => read(TIER_KEY, (v) => STAY_TIERS.includes(v), 'comfort'),
    setTier: (tier) => STAY_TIERS.includes(tier) && write(TIER_KEY, tier),
  };
}

const prefs = createPrefs();
export const getDiets = () => prefs.diets();
export const setDiets = (list) => prefs.setDiets(list);
export const getStayTier = () => prefs.tier();
export const setStayTier = (tier) => prefs.setTier(tier);
