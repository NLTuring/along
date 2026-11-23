// InsTrip mobile — seed data for phase one (no backend yet).
// Values come from docs/03-种子数据.json; display names come from the web prototype.
// These are content, not UI copy: in later phases they arrive from GET /api/cities
// and GET /api/guides in the traveller's language.

export const CITIES = [
  { slug: 'shanghai', tz: 'Asia/Shanghai' },
  { slug: 'nanjing', tz: 'Asia/Shanghai' },
];

export const DAY_OPTIONS = [3, 5, 7];

export const GUIDES = [
  {
    id: 'guide_jiajia',
    name: 'Chen Jiajia',
    kind: 'VOLUNTEER',
    citySlug: 'shanghai',
    headline: 'Design student, film photographer',
    topics: ['Photography', 'Slow walks'],
    photo: 'img/chen-jiajia.jpg',
    priceHalfCents: 0,
    ratingAvg: 4.9,
    ratingCount: 32,
  },
  {
    id: 'guide_zhangmin',
    name: 'Zhang Min',
    kind: 'LICENSED',
    citySlug: 'shanghai',
    headline: 'Community guide, food markets',
    topics: ['Street food', 'Markets'],
    photo: 'img/zhang-min.jpg',
    priceHalfCents: 4900,
    ratingAvg: 4.8,
    ratingCount: 51,
  },
  {
    id: 'guide_junjie',
    name: 'Huang Junjie',
    kind: 'LICENSED',
    citySlug: 'nanjing',
    headline: 'Architecture student, city wall nerd',
    topics: ['Architecture', 'History'],
    photo: 'img/huang-junjie.jpg',
    priceHalfCents: 5500,
    ratingAvg: 4.9,
    ratingCount: 28,
  },
];

export const PASS_PRICE_CENTS = 990; // spec §7.1
