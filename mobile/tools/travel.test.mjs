// Food and stays: the seed's facts and sources, the diet filter, meals per plan day, nights,
// day costs and the wiring into the plan, map and 小游. In-memory storage; no browser or network.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildPlan, validatePlan } from '../assets/js/plan.js';
import { POIS, PLAN_TEMPLATE } from '../assets/js/seed-places.js';
import { CITIES } from '../assets/js/seed.js';
import { RESTAURANTS, DISHES, DIETS, ORDER_PHRASES, STAY_AREAS, STAY_TIERS, STAY_SOURCES, DISH_FLAGS, MEAL_STOPS, travelPlace, TRAVEL_PLACES } from '../assets/js/seed-food.js';
import {
  DIET_IDS, dishFit, restaurantFit, kitchenGap, mealsFor, mealSlots, mealStopFor, mealPlan, MEAL_SLOTS, MEAL_CNY,
  cityDishes, nightsFor, nightAfter, cityChanges, dayCost, createPrefs, cnyToUsdCents,
} from '../assets/js/travel.js';
import { FX_CNY_PER_USD } from '../assets/js/format.js';
import { parseCommand } from '../assets/js/assistant-commands.js';
import { WINDOW_PLACES } from '../assets/js/window-scenes.js';
import { GUIDES } from '../assets/js/seed.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const ARRIVAL = { date: '2026-12-20', time: '18:00', city: 'shanghai', days: 3 };
const plan = (prefs = {}) => buildPlan(ARRIVAL, prefs);
const byId = (id) => RESTAURANTS.find((r) => r.id === id);

function memory() {
  const data = new Map();
  return { fail: false, data,
    getItem(key) { if (this.fail) throw new Error('Injected storage failure'); return data.get(String(key)) ?? null; },
    setItem(key, value) { if (this.fail) throw new Error('Injected storage failure'); data.set(String(key), String(value)); } };
}

describe('food and stay seed', () => {
  it('names a source for every restaurant and every stay area, and only flags it knows', () => {
    const ids = new Set();
    for (const r of RESTAURANTS) {
      assert.ok(!ids.has(r.id), `${r.id} is unique`); ids.add(r.id);
      assert.ok(CITIES.some((c) => c.slug === r.citySlug), `${r.id} city`);
      assert.match(r.source, /百度百科「.+」/, `${r.id} names its source`);
      assert.ok(r.nameZh.trim() && r.nameEn.trim() && r.areaZh.trim() && r.areaEn.trim() && r.tipZh.trim() && r.tipEn.trim(), `${r.id} copy in both languages`);
      assert.ok([1, 2, 3].includes(r.tier), `${r.id} tier`);
      assert.ok(Number.isInteger(r.since) && r.since > 1800 && r.since < 2030, `${r.id} founding year`);
      assert.ok(r.near === null || Object.hasOwn(POIS, r.near), `${r.id} is near a real stop`);
      assert.ok(r.diets.every((d) => ['halal', 'vegetarian'].includes(d)), `${r.id} kitchen diets`);
      assert.ok(r.dishes.length, `${r.id} has dishes`);
      for (const dish of r.dishes) assert.ok(dish.zh && dish.en && dish.flags.every((f) => DISH_FLAGS.includes(f)), `${r.id} ${dish.zh}`);
      // A vegetarian kitchen serves no meat or seafood.
      if (r.diets.includes('vegetarian')) for (const dish of r.dishes) assert.deepEqual(dish.flags.filter((f) => ['meat', 'pork', 'seafood'].includes(f)), [], `${r.id} ${dish.zh}`);
      // A halal kitchen serves no pork.
      if (r.diets.includes('halal')) for (const dish of r.dishes) assert.equal(dish.flags.includes('pork'), false, `${r.id} ${dish.zh}`);
    }
    for (const a of STAY_AREAS) {
      assert.ok(STAY_SOURCES[a.id], `${a.id} names the station entries its metro lines came from`);
      assert.ok(a.near.length && a.near.every((id) => Object.hasOwn(POIS, id)), `${a.id} is near real stops`);
      assert.deepEqual(Object.keys(a.nightlyCny).sort(), [...STAY_TIERS].sort(), `${a.id} has every tier`);
      for (const tier of STAY_TIERS) { const [lo, hi] = a.nightlyCny[tier]; assert.ok(Number.isInteger(lo) && Number.isInteger(hi) && lo > 0 && lo < hi, `${a.id} ${tier}`); }
      assert.ok(a.nightlyCny.budget[1] <= a.nightlyCny.luxury[0], `${a.id} tiers do not overlap end to end`);
      assert.equal(a.estimate, undefined, 'the page, not a per-area flag, says every nightly price is an estimate');
    }
    for (const city of CITIES) {
      assert.ok(STAY_AREAS.some((a) => a.citySlug === city.slug), `${city.slug} has a stay area`);
      assert.ok(RESTAURANTS.some((r) => r.citySlug === city.slug && r.diets.includes('vegetarian')), `${city.slug} has a vegetarian kitchen`);
    }
  });
  it('gives no opening hours or exact prices it could not confirm', () => {
    for (const r of RESTAURANTS) {
      assert.equal('hours' in r, false, `${r.id} has no unverified hours`);
      assert.equal('priceCents' in r || 'perHead' in r, false, `${r.id} has no unverified price`);
    }
  });
  it('keeps the diet cards and ordering lines in both languages', () => {
    assert.deepEqual(DIET_IDS, DIETS.map((d) => d.id));
    for (const d of DIETS) assert.ok(d.cardZh.trim() && d.cardEn.trim() && /[\u4e00-\u9fff]/.test(d.cardZh), d.id);
    assert.ok(ORDER_PHRASES.length >= 3);
    for (const p of ORDER_PHRASES) assert.ok(p.zh.trim() && p.en.trim(), p.zh);
    assert.ok(ORDER_PHRASES.some((p) => /多少钱/.test(p.zh)), 'one line asks the price');
    assert.ok(ORDER_PHRASES.some((p) => /按斤/.test(p.zh)), 'one line asks whether it is sold by weight');
  });
  it('lists dishes worth a trip in each city, pointing only at real restaurants in that city', () => {
    for (const city of CITIES) assert.ok(DISHES.filter((d) => d.citySlug === city.slug).length >= 3, city.slug);
    for (const dish of DISHES) {
      assert.ok(dish.zh && dish.en && dish.descZh && dish.descEn, dish.id);
      for (const id of dish.at) assert.equal(byId(id)?.citySlug, dish.citySlug, `${dish.id} at ${id}`);
    }
  });
  it('lets the map find restaurants and stay areas by name only', () => {
    for (const item of [...RESTAURANTS, ...STAY_AREAS]) {
      const place = travelPlace(item.id);
      assert.equal(place.id, item.id); assert.equal(place.citySlug, item.citySlug);
      assert.ok(place.nameZh && !/[（）·]/.test(place.nameZh), `${item.id} searches a plain name: ${place.nameZh}`);
      assert.equal('lat' in place || 'lng' in place, false, 'no unverified coordinates');
      assert.deepEqual(TRAVEL_PLACES[item.id], place);
    }
    assert.equal(travelPlace('stay_renmin').nameZh, '南京东路');
    assert.equal(travelPlace('eat_nanxiang').nameZh, '南翔馒头店');
    assert.equal(travelPlace('nope'), null);
    for (const id of Object.keys(TRAVEL_PLACES)) assert.equal(Object.hasOwn(POIS, id) || Object.hasOwn(WINDOW_PLACES, id), false, `${id} does not clash`);
  });
});

describe('diet filter', () => {
  it('rules out what a diet cannot eat and never promises a dish whose recipe varies', () => {
    const pork = { flags: ['meat', 'pork'] }, shrimp = { flags: ['seafood'] }, veg = { flags: [] }, varies = { flags: ['ask'] };
    assert.equal(dishFit(pork, []), 'ok'); assert.equal(dishFit(varies, []), 'ok', 'no diet: nothing to ask');
    assert.equal(dishFit(pork, ['noPork']), 'no'); assert.equal(dishFit(pork, ['halal']), 'no'); assert.equal(dishFit(pork, ['vegetarian']), 'no');
    assert.equal(dishFit(shrimp, ['noSeafood']), 'no'); assert.equal(dishFit(shrimp, ['vegetarian']), 'no'); assert.equal(dishFit(shrimp, ['noPork']), 'ok');
    assert.equal(dishFit(varies, ['noPork']), 'ask');
    assert.equal(dishFit(veg, ['peanut']), 'ask', 'oil is not recorded, so a peanut allergy always asks');
    assert.equal(dishFit(veg, ['gluten']), 'ask', 'soy sauce and seitan are not recorded');
    assert.equal(dishFit(veg, ['noSpicy']), 'ok');
  });
  it('trusts a halal or vegetarian kitchen and only half-trusts any other', () => {
    assert.equal(restaurantFit(byId('eat_lvliuju'), ['halal']).fit, 'ok'); assert.equal(restaurantFit(byId('eat_lvliuju'), ['halal']).kitchen, true);
    assert.equal(restaurantFit(byId('eat_maxiangxing'), ['halal']).fit, 'ok');
    assert.equal(restaurantFit(byId('eat_nanxiang'), ['halal']).fit, 'no', 'pork dumplings');
    assert.equal(restaurantFit(byId('eat_laofandian'), ['halal']).fit, 'no', 'meat outside a halal kitchen');
    assert.equal(restaurantFit(byId('eat_gongdelin'), ['halal']).fit, 'ask', 'a vegetarian kitchen has no meat, but is not certified halal');
    assert.equal(restaurantFit(byId('eat_gongdelin'), ['vegetarian']).fit, 'ok');
    assert.equal(restaurantFit(byId('eat_maxiangxing'), ['vegetarian']).fit, 'ask', 'vegetable dishes of an ordinary kitchen');
    assert.equal(restaurantFit(byId('eat_maxiangxing'), ['vegetarian']).kitchen, false);
    assert.equal(restaurantFit(byId('eat_nanxiang'), ['noSeafood']).fit, 'ok');
    assert.equal(restaurantFit(byId('eat_lvliuju'), ['halal', 'vegetarian']).kitchen, true);
    assert.equal(restaurantFit(byId('eat_maxiangxing'), ['halal', 'vegetarian']).kitchen, false);
  });
  it('says when a city has no kitchen for a diet', () => {
    assert.deepEqual(kitchenGap('shanghai', ['halal']), ['halal']);
    assert.deepEqual(kitchenGap('nanjing', ['halal']), []);
    assert.deepEqual(kitchenGap('shanghai', ['vegetarian', 'noPork']), []);
    assert.deepEqual(kitchenGap('shanghai', []), []);
  });
  it('judges the city dishes the same way', () => {
    const veg = cityDishes('nanjing', ['vegetarian']);
    assert.equal(veg.find((d) => d.id === 'dish_sucaibao').fit, 'ok');
    assert.equal(veg.find((d) => d.id === 'dish_yanshuiya').fit, 'no');
    assert.ok(cityDishes('shanghai').every((d) => d.citySlug === 'shanghai' && d.fit === 'ok'));
    const halal = cityDishes('shanghai', ['halal']);
    assert.equal(halal.find((d) => d.id === 'dish_badaoya').fit, 'no', 'meat from a kitchen that is not halal');
    assert.equal(halal.find((d) => d.id === 'dish_sushi').fit, 'ask', 'no meat, but the kitchen is not halal');
    assert.equal(cityDishes('nanjing', ['halal']).find((d) => d.id === 'dish_yanshuiya').fit, 'no', 'sold everywhere: no halal kitchen vouches for it');
  });
  it('shows no suits-you badge until something is chosen to avoid', async () => {
    const page = await read('../assets/js/page-travel.js');
    assert.match(page, /function fitBadge\(fit, diets\) \{\n  return diets\.length \?/);
    assert.equal((page.match(/fitBadge\([^)]*\)/g) || []).filter((call) => !/, diets\)$/.test(call) && !/^fitBadge\(fit, diets\)$/.test(call)).length, 0, 'every badge is given the diets');
  });
});

describe('meals per plan day', () => {
  it('leaves out the meals the plan already eats at a stop', () => {
    const [d1, d2, d3] = plan().daysData;
    assert.equal(mealStopFor(d1, 'dinner')?.poiId, 'poi_jingan'); assert.deepEqual(mealSlots(d1), ['lunch']);
    assert.equal(mealStopFor(d2, 'lunch')?.poiId, 'poi_laomendong'); assert.deepEqual(mealSlots(d2), ['dinner']);
    assert.deepEqual(mealSlots(d3), ['lunch', 'dinner']);
    assert.deepEqual(MEAL_SLOTS, ['lunch', 'dinner']);
    assert.ok(MEAL_STOPS.every((id) => Object.hasOwn(POIS, id)));
  });
  it('picks restaurants in the day’s city, near its stops first, that suit the diet', () => {
    const days = plan().daysData;
    for (const diets of [[], ['halal'], ['vegetarian'], ['noPork', 'peanut'], ['noSeafood', 'gluten']]) {
      days.forEach((day) => {
        for (const item of mealsFor(day, diets)) {
          assert.equal(item.restaurant.citySlug, day.citySlug, `${day.citySlug} ${diets}`);
          assert.notEqual(item.fit, 'no');
          assert.ok(item.nearStop === null || day.stops.some((s) => s.poiId === item.nearStop));
        }
      });
    }
    assert.equal(mealsFor(days[0], [])[0].restaurant.id, 'eat_nanxiang', 'Yu Garden is a stop that day');
    assert.equal(mealsFor(days[0], [])[0].nearStop, 'poi_yuyuan');
    assert.equal(mealsFor(days[1], ['halal'])[0].restaurant.id, 'eat_lvliuju', 'a halal kitchen leads for a halal traveller');
    assert.equal(mealsFor(days[1], ['vegetarian'])[0].kitchen, true);
    assert.deepEqual(mealsFor(null), []);
  });
  it('fills each open slot, and gives the same answer every time', () => {
    const days = plan().daysData;
    for (const day of days) {
      const meals = mealPlan(day, []);
      assert.deepEqual(meals.map((m) => m.slot), mealSlots(day));
      assert.ok(meals.every((m) => m.item));
      assert.deepEqual(mealPlan(day, []), meals);
    }
    const day3 = mealPlan(days[2], []);
    assert.notEqual(day3[0].item.restaurant.id, day3[1].item.restaurant.id, 'lunch and dinner differ when they can');
  });
  it('repeats a restaurant only when it is the only one that fits, and says so', () => {
    const day3 = plan().daysData[2];
    const veg = mealPlan(day3, ['vegetarian']);
    assert.equal(mealsFor(day3, ['vegetarian']).length, 1, 'Gongdelin is the only Shanghai pick for a vegetarian');
    assert.deepEqual(veg.map((m) => [m.slot, m.item.restaurant.id, m.repeat]), [['lunch', 'eat_gongdelin', false], ['dinner', 'eat_gongdelin', true]]);
    assert.ok(mealPlan(day3, []).every((m) => m.repeat === false));
  });
});

describe('nights', () => {
  it('has one night before each planned day, in the city where that evening ends', () => {
    const p = plan(), nights = nightsFor(p);
    assert.deepEqual(nights.map((n) => n.night), [0, 1, 2]);
    assert.deepEqual(nights.map((n) => n.city), ['shanghai', 'shanghai', 'nanjing'], 'arrival night, then Shanghai after day 1, Nanjing after day 2');
    for (const n of nights) assert.equal(n.area.citySlug, n.city);
    assert.equal(nights[0].move, null);
    assert.deepEqual(nights[1].move, { from: 'shanghai', to: 'nanjing' }, 'check out before the train to Nanjing');
    assert.deepEqual(nights[2].move, { from: 'nanjing', to: 'shanghai' });
    assert.equal(nights[2].area.id, 'stay_fuzimiao', 'day 2 ends at Fuzimiao');
    assert.ok(nights[2].nearStops.includes('poi_fuzimiao'));
    assert.equal(nightAfter(p, 0)?.night, 1); assert.equal(nightAfter(p, 2), null, 'no night after the last day');
  });
  it('follows the plan: a one-day stay has only the arrival night', () => {
    const p = plan(); p.daysData = p.daysData.slice(0, 1);
    assert.deepEqual(nightsFor(p).map((n) => n.night), [0]);
    assert.deepEqual(nightsFor(null), []);
  });
  it('lists the days that change city', () => {
    assert.deepEqual(cityChanges(plan()), [{ dayIndex: 1, from: 'shanghai', to: 'nanjing' }, { dayIndex: 2, from: 'nanjing', to: 'shanghai' }]);
    assert.deepEqual(cityChanges(null), []);
  });
});

describe('what a day costs', () => {
  const yuan = (cents) => Math.round((cents / 100) * FX_CNY_PER_USD);
  it('adds tickets, open meals and the night after, as yuan ranges', () => {
    const p = plan();
    p.daysData.forEach((day, n) => {
      const cost = dayCost(p, n, { tier: 'comfort' });
      assert.equal(cost.tickets, yuan(day.stops.reduce((s, stop) => s + stop.costCents, 0)), `day ${n + 1} tickets`);
      const meals = mealPlan(day, []).reduce((sum, { item }) => [sum[0] + MEAL_CNY[item.restaurant.tier][0], sum[1] + MEAL_CNY[item.restaurant.tier][1]], [0, 0]);
      assert.deepEqual(cost.meals, meals, `day ${n + 1} meals`);
      const area = nightAfter(p, n)?.area;
      assert.deepEqual(cost.night, area ? area.nightlyCny.comfort : [0, 0]);
      assert.equal(cost.hasNight, !!area);
      assert.deepEqual(cost.total, [cost.tickets + meals[0] + cost.night[0], cost.tickets + meals[1] + cost.night[1]]);
      assert.ok(cost.total[0] <= cost.total[1]);
    });
    assert.equal(dayCost(p, 2).hasNight, false);
    assert.equal(dayCost(p, 9), null);
    assert.ok(dayCost(p, 0, { tier: 'luxury' }).total[0] > dayCost(p, 0, { tier: 'budget' }).total[0]);
  });
  it('compares the day without the hotel with the daily budget', () => {
    assert.equal(dayCost(plan(), 0).budgetFit, null, 'no budget given');
    assert.equal(dayCost(plan({ budget: '5000', budgetCurrency: 'CNY' }), 0).budgetFit, 'within');
    assert.equal(dayCost(plan({ budget: '1', budgetCurrency: 'CNY' }), 0).budgetFit, 'over');
    const p = plan({ budget: '300', budgetCurrency: 'CNY' }), cost = dayCost(p, 0);
    const [lo, hi] = [cost.tickets + cost.meals[0], cost.tickets + cost.meals[1]];
    assert.equal(cost.budgetFit, hi <= cost.budget ? 'within' : lo > cost.budget ? 'over' : 'maybe');
    assert.equal(cost.budget, 300);
    assert.equal(dayCost(plan({ budget: '50' }), 0).budget, yuan(5000), 'a dollar budget is shown in yuan too');
  });
  it('keeps a yuan budget as typed, so it reads back as typed', () => {
    const p = plan({ budget: '400', budgetCurrency: 'CNY' });
    assert.equal(p.budgetYuan, 400); assert.equal(dayCost(p, 0).budget, 400);
    assert.equal(plan({ budget: '400' }).budgetYuan, undefined, 'a dollar budget keeps only cents');
    assert.equal(plan({ budgetCurrency: 'CNY' }).budgetYuan, undefined, 'no budget, nothing kept');
    assert.deepEqual(validatePlan(p), []);
    assert.ok(validatePlan({ ...p, budgetYuan: -1 }).includes('invalid budget'));
    assert.ok(validatePlan({ ...p, budgetYuan: 1.5 }).includes('invalid budget'));
    assert.ok(validatePlan({ ...p, budgetCents: null }).includes('invalid budget'), 'yuan without cents is a broken plan');
  });
  it('converts yuan to the stored cents at the reference rate', () => {
    assert.equal(cnyToUsdCents(0), 0); assert.equal(cnyToUsdCents(FX_CNY_PER_USD), 100);
  });
});

describe('saved choices', () => {
  it('keeps only known diets and tiers, and still holds a choice the phone could not save', () => {
    const storage = memory(), prefs = createPrefs({ storage: () => storage });
    assert.deepEqual(prefs.diets(), []); assert.equal(prefs.tier(), 'comfort');
    assert.equal(prefs.setDiets(['halal', 'ADMIN', 'halal', 'noSpicy']), true);
    assert.deepEqual(prefs.diets(), ['halal', 'noSpicy']);
    assert.deepEqual(createPrefs({ storage: () => storage }).diets(), ['halal', 'noSpicy'], 'saved on the phone');
    assert.equal(prefs.setTier('palace'), false); assert.equal(prefs.tier(), 'comfort');
    assert.equal(prefs.setTier('budget'), true); assert.equal(createPrefs({ storage: () => storage }).tier(), 'budget');
    storage.setItem('along.diet.v1', '{broken'); assert.deepEqual(createPrefs({ storage: () => storage }).diets(), []);
    storage.setItem('along.diet.v1', JSON.stringify('halal')); assert.deepEqual(createPrefs({ storage: () => storage }).diets(), []);
    const broken = memory(); broken.fail = true;
    const offline = createPrefs({ storage: () => broken });
    assert.equal(offline.setDiets(['vegetarian']), false, 'reports that it could not save');
    assert.deepEqual(offline.diets(), ['vegetarian'], 'but the choice holds for now');
  });
});

describe('wiring', () => {
  it('opens Food and stays from its route, the You tab, the plan and 小游', async () => {
    globalThis.window ??= globalThis;
    const { parseHash } = await import('../assets/js/router.js');
    assert.deepEqual(parseHash('#/travel'), { name: 'travel', param: null, tab: 'trip', nav: true, key: 'travel' });
    assert.equal(parseHash('#/travel/nanjing').param, 'nanjing');
    const app = await read('../assets/js/app.js'), you = await read('../assets/js/page-you.js'), page = await read('../assets/js/page-plan.js');
    assert.match(app, /travel: renderTravel/);
    assert.match(you, /\['eat', 'bowl'\]/); assert.match(you, /eat: 'travel'/);
    assert.match(page, /mealsHtml\(day\)/); assert.match(page, /stayHtml\(plan, n \+ 1\)/); assert.match(page, /dayCostHtml\(plan, n\)/);
    assert.match(page, /go\(`travel\//);
    for (const text of ['美食', '去哪吃', '住哪', '清真', 'where to eat', 'hotels']) {
      const command = parseCommand(text, { places: { ...POIS, ...WINDOW_PLACES, ...TRAVEL_PLACES }, guides: GUIDES });
      assert.equal(command?.route, 'travel', text);
    }
    assert.equal(parseCommand('带我去马祥兴', { places: TRAVEL_PLACES, guides: [] })?.place, 'eat_maxiangxing');
  });
  it('lets both maps open a restaurant or stay area', async () => {
    for (const file of ['page-map.js', 'page-native-map.js']) assert.match(await read(`../assets/js/${file}`), /\|\| travelPlace\(poiId\)/, file);
    const assistant = await read('../assets/js/assistant.js');
    assert.match(assistant, /\.\.\.TRAVEL_PLACES/);
  });
  it('loads the copy and the styles', async () => {
    const i18n = await read('../assets/js/i18n.js'), html = await read('../assets/index.html');
    assert.match(i18n, /'pay', 'travel'[,\]]/);
    assert.match(html, /css\/travel\.css/);
    const [en, zh] = await Promise.all(['en', 'zh'].map(async (l) => JSON.parse(await read(`../assets/messages/travel.${l}.json`))));
    assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
    const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en)) { assert.ok(en[key].trim() && zh[key].trim(), key); assert.deepEqual(holes(en[key]), holes(zh[key]), key); assert.equal(en[key].includes('!'), false, key); }
    for (const id of DIET_IDS) assert.ok(en[`travel.diet.${id}`] && zh[`travel.diet.${id}`], id);
    for (const tier of STAY_TIERS) assert.ok(en[`travel.stay.${tier}`], tier);
    assert.match(zh['travel.tips.checkin'], /24 小时/); assert.match(zh['travel.tips.checkin'], /72 小时/);
    assert.match(zh['travel.tips.sources'], /佛山市消费者委员会/);
  });
  it('keeps the sample plan unchanged', () => {
    assert.equal(PLAN_TEMPLATE.daysData.length, 3);
    assert.deepEqual(plan().daysData.map((d) => d.citySlug), ['shanghai', 'nanjing', 'shanghai']);
  });
});
