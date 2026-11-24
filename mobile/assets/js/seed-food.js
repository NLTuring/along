// Along mobile — where to eat and where to stay, for the two seed cities.
// Every restaurant fact here (address, founding year, halal or vegetarian kitchen, signature
// dishes, queues) was checked against its Baidu Baike entry; `source` names it. Opening hours
// and prices per head could not be confirmed, so none are given: restaurants carry a price
// tier only, and the pages tell people to check before they go.
// Stay areas name only metro lines confirmed in the station entries (STAY_SOURCES). Their
// nightly prices are a rough guide written for this demo, not market data, and the page says so.

// Dish flags drive the dietary filter (travel.js). `ask` marks recipes that vary between
// kitchens, so the page says to ask rather than promising either way.
export const DISH_FLAGS = ['meat', 'pork', 'seafood', 'peanut', 'spicy', 'ask'];

export const DIETS = [
  {
    id: 'halal',
    cardZh: '我是穆斯林，只吃清真食品。请问这里是清真餐厅吗？',
    cardEn: 'I am Muslim and only eat halal food. Is this a halal restaurant?',
  },
  {
    id: 'vegetarian',
    cardZh: '我吃素：不吃肉、鱼和海鲜，也请不要用猪油、肉汤或鱼露。',
    cardEn: 'I am vegetarian: no meat, fish or seafood, and no lard, meat stock or fish sauce, please.',
  },
  {
    id: 'noPork',
    cardZh: '我不吃猪肉，也不吃猪油和猪骨汤。',
    cardEn: 'I do not eat pork, lard or pork-bone soup.',
  },
  {
    id: 'noSeafood',
    cardZh: '我不能吃海鲜（鱼、虾、蟹、贝类），也请不要放海鲜做的调料。',
    cardEn: 'I cannot eat seafood (fish, shrimp, crab, shellfish), or sauces made from it.',
  },
  {
    id: 'peanut',
    cardZh: '我对花生过敏，请不要放花生和花生油。',
    cardEn: 'I am allergic to peanuts. No peanuts or peanut oil, please.',
  },
  {
    id: 'gluten',
    cardZh: '我对麸质过敏，不能吃小麦、面粉、面筋，也不能用普通酱油。',
    cardEn: 'I cannot eat gluten: no wheat, flour, seitan (mianjin) or ordinary soy sauce.',
  },
  {
    id: 'noSpicy',
    cardZh: '请不要放辣椒，也不要放花椒。',
    cardEn: 'No chilli and no Sichuan pepper, please.',
  },
];

// Short lines for ordering, shown on the same card. The price question answers the most common
// dining complaint in the Foshan consumer survey: dishes without a clear price.
export const ORDER_PHRASES = [
  { zh: '这个，来一份。', en: 'This one, one portion.' },
  { zh: '请问这道菜多少钱一份？', en: 'How much is one portion of this dish?' },
  { zh: '请问是按份算，还是按斤称？', en: 'Is it priced per portion or by weight?' },
  { zh: '少放点盐和油，谢谢。', en: 'Less salt and oil, please.' },
  { zh: '买单。可以扫码付款吗？', en: 'The bill, please. Can I pay by scanning a code?' },
];

// Stops in the sample plan that already are a meal: dinner in Jing'an, snacks through Laomendong.
export const MEAL_STOPS = ['poi_jingan', 'poi_laomendong'];

export const RESTAURANTS = [
  {
    id: 'eat_nanxiang',
    citySlug: 'shanghai',
    nameZh: '南翔馒头店（豫园店）',
    nameEn: 'Nanxiang Steamed Bun Restaurant, Yu Garden',
    areaZh: '豫园九曲桥畔',
    areaEn: 'By the zigzag bridge in Yu Garden',
    near: 'poi_yuyuan',
    since: 1900,
    tier: 2,
    diets: [],
    dishes: [
      { zh: '南翔小笼', en: 'Nanxiang soup dumplings (xiaolongbao)', flags: ['meat', 'pork'] },
    ],
    tipZh: '小笼制作技艺是国家级非遗，店外常排长队。避开饭点去，能少等很久。',
    tipEn: 'Its dumpling craft is national intangible heritage, and the queue outside is long. Go outside mealtimes.',
    source: '百度百科「南翔馒头店」',
  },
  {
    id: 'eat_laofandian',
    citySlug: 'shanghai',
    nameZh: '上海老饭店',
    nameEn: 'Shanghai Lao Fan Dian',
    areaZh: '黄浦区福佑路 242 号，豫园旅游区内',
    areaEn: '242 Fuyou Road, inside the Yu Garden area',
    near: 'poi_yuyuan',
    since: 1875,
    tier: 3,
    diets: [],
    dishes: [
      { zh: '八宝鸭', en: 'Eight-treasure duck', flags: ['meat', 'ask'] },
      { zh: '虾子大乌参', en: 'Braised sea cucumber with shrimp roe', flags: ['seafood'] },
      { zh: '油爆虾', en: 'Quick-fried river shrimp', flags: ['seafood'] },
    ],
    tipZh: '本帮菜老字号。本帮菜浓油赤酱、偏甜，一桌人分着吃最合适。',
    tipEn: 'A long-running house of Shanghai cooking, which is rich, dark and sweet. Best shared at a table.',
    source: '百度百科「上海老饭店」',
  },
  {
    id: 'eat_xiaoyang',
    citySlug: 'shanghai',
    nameZh: '小杨生煎',
    nameEn: "Yang's Dumplings",
    areaZh: '连锁店，全上海有很多门店',
    areaEn: 'A chain with branches all over Shanghai',
    near: null,
    chain: true,
    since: 1994,
    tier: 1,
    diets: [],
    dishes: [
      { zh: '生煎', en: 'Pan-fried pork buns (shengjian)', flags: ['meat', 'pork'] },
      { zh: '馄饨', en: 'Wontons', flags: ['meat', 'ask'] },
    ],
    tipZh: '生煎刚出锅里面全是汤，先咬一个小口，等汤凉一点再吃。',
    tipEn: 'A fresh bun is full of hot soup. Bite a small hole first and let it cool.',
    source: '百度百科「小杨生煎」',
  },
  {
    id: 'eat_gongdelin',
    citySlug: 'shanghai',
    nameZh: '功德林',
    nameEn: 'Gongdelin Vegetarian Restaurant',
    areaZh: '上海素食老字号，出发前在地图上搜最近门店',
    areaEn: 'A long-running vegetarian name. Search the map for the nearest branch.',
    near: null,
    since: 1922,
    tier: 2,
    diets: ['vegetarian'],
    dishes: [
      { zh: '素鸡', en: 'Tofu "chicken"', flags: [] },
      { zh: '素鸭', en: 'Tofu-skin "duck"', flags: [] },
    ],
    tipZh: '素菜荤做：看着像肉，其实全素。素食制作技艺是国家级非遗。',
    tipEn: 'Vegetarian dishes made to look like meat. Its vegetarian cooking is national intangible heritage.',
    source: '百度百科「功德林」',
  },
  {
    id: 'eat_maxiangxing',
    citySlug: 'nanjing',
    nameZh: '马祥兴菜馆',
    nameEn: 'Ma Xiang Xing',
    areaZh: '鼓楼广场西北侧',
    areaEn: 'North-west side of Gulou Square',
    near: null,
    since: 1845,
    tier: 2,
    diets: ['halal'],
    dishes: [
      { zh: '美人肝', en: 'Meirengan, the house duck dish', flags: ['meat'] },
      { zh: '松鼠鱼', en: 'Squirrel-shaped sweet and sour fish', flags: ['seafood'] },
      { zh: '凤尾虾', en: 'Phoenix-tail shrimp', flags: ['seafood'] },
      { zh: '蛋烧卖', en: 'Egg-wrapper shaomai', flags: ['ask'] },
    ],
    tipZh: '南京清真菜的代表，中华老字号，清真烹饪技艺是江苏省非遗。',
    tipEn: 'The best-known halal kitchen in Nanjing, with a provincial heritage listing for its halal cooking.',
    source: '百度百科「马祥兴」',
  },
  {
    id: 'eat_lvliuju',
    citySlug: 'nanjing',
    nameZh: '绿柳居',
    nameEn: 'Lvliuju',
    areaZh: '南京老字号，有多家门店，出发前搜最近一家',
    areaEn: 'A Nanjing name with several branches. Search for the nearest.',
    near: null,
    since: 1912,
    tier: 2,
    diets: ['halal', 'vegetarian'],
    dishes: [
      { zh: '绿柳素菜包', en: 'Vegetable buns', flags: [] },
      { zh: '素烧鹅', en: 'Tofu-skin "goose"', flags: [] },
    ],
    tipZh: '以清真菜和素菜出名，全素宴用豆腐皮、面筋做成荤菜的样子。',
    tipEn: 'Known for halal and vegetarian cooking: a whole vegetarian banquet of tofu skin and gluten made to look like meat.',
    source: '百度百科「绿柳居」',
  },
  {
    id: 'eat_yonghe',
    citySlug: 'nanjing',
    nameZh: '永和园',
    nameEn: 'Yonghe Yuan',
    areaZh: '夫子庙建康路 68 号',
    areaEn: '68 Jiankang Road, Fuzimiao',
    near: 'poi_fuzimiao',
    since: 1901,
    tier: 2,
    diets: [],
    dishes: [
      { zh: '开洋干丝', en: 'Shredded tofu with dried shrimp', flags: ['seafood'] },
      { zh: '蟹壳黄烧饼', en: 'Crab-shell sesame cakes', flags: ['ask'] },
    ],
    tipZh: '秦淮小吃老字号，开洋干丝和蟹壳黄烧饼都是“秦淮八绝”。',
    tipEn: 'An old house of Qinhuai snacks; both of these are among the "eight Qinhuai specialities".',
    source: '百度百科「永和园」',
  },
];

// The city's dishes worth a special trip. `at` lists restaurants above that serve them.
export const DISHES = [
  { id: 'dish_xiaolong', citySlug: 'shanghai', zh: '小笼包', en: 'Soup dumplings', flags: ['meat', 'pork'], at: ['eat_nanxiang'],
    descZh: '薄皮裹着一包热汤，先咬口喝汤再吃。', descEn: 'A thin skin around hot soup. Sip the soup first.' },
  { id: 'dish_shengjian', citySlug: 'shanghai', zh: '生煎', en: 'Pan-fried buns', flags: ['meat', 'pork'], at: ['eat_xiaoyang'],
    descZh: '底部煎得焦脆，上面撒芝麻和葱花。', descEn: 'Crisp, fried base, sesame and spring onion on top.' },
  { id: 'dish_badaoya', citySlug: 'shanghai', zh: '八宝鸭', en: 'Eight-treasure duck', flags: ['meat', 'ask'], at: ['eat_laofandian'],
    descZh: '整鸭里塞糯米和多种配料，配料各家不同。', descEn: 'A whole duck stuffed with sticky rice and mixed fillings that differ by kitchen.' },
  { id: 'dish_sushi', citySlug: 'shanghai', zh: '素鸡素鸭', en: 'Tofu "chicken" and "duck"', flags: [], at: ['eat_gongdelin'],
    descZh: '豆制品做成荤菜的样子，全素。', descEn: 'Tofu made to look like meat. Fully vegetarian.' },
  { id: 'dish_yanshuiya', citySlug: 'nanjing', zh: '盐水鸭', en: 'Salted duck', flags: ['meat'], at: [],
    descZh: '南京最有名的特产，皮白肉嫩、咸香不腻，中秋前后最好吃。', descEn: "Nanjing's best-known speciality: pale skin, tender and lightly salty. Best around mid-autumn." },
  { id: 'dish_yaxue', citySlug: 'nanjing', zh: '鸭血粉丝汤', en: 'Duck blood and vermicelli soup', flags: ['meat'], at: [],
    descZh: '老鸭汤里有鸭血、鸭肠、鸭肝和粉丝，不吃内脏的可以说“不要鸭杂”。', descEn: 'Duck stock with duck blood, intestine, liver and glass noodles. Say "bu yao ya za" to leave out the offal.' },
  { id: 'dish_ganst', citySlug: 'nanjing', zh: '开洋干丝', en: 'Shredded tofu with dried shrimp', flags: ['seafood'], at: ['eat_yonghe'],
    descZh: '细如线的豆腐干丝加开洋（虾米）。', descEn: 'Tofu cut thin as thread, with dried shrimp.' },
  { id: 'dish_sucaibao', citySlug: 'nanjing', zh: '素菜包', en: 'Vegetable buns', flags: [], at: ['eat_lvliuju'],
    descZh: '绿柳居的招牌，全素。', descEn: "Lvliuju's signature, fully vegetarian." },
];

export const STAY_TIERS = ['budget', 'comfort', 'luxury'];

// Areas rather than single hotels: hotels open, close and reprice too often to name here.
// `near` lists sample-plan stops the area is handy for; transit lines are named only where certain.
export const STAY_AREAS = [
  {
    id: 'stay_renmin',
    citySlug: 'shanghai',
    nameZh: '南京东路·外滩',
    nameEn: 'East Nanjing Road and the Bund',
    near: ['poi_yuyuan', 'poi_ferry'],
    whyZh: '地铁 2、10 号线在南京东路站换乘，步行可到外滩，去豫园、坐黄浦江轮渡都方便。第一次来上海最省心。',
    whyEn: 'Metro lines 2 and 10 meet at East Nanjing Road station, and the Bund is a walk away. Handy for Yu Garden and the Huangpu ferry; the easy choice for a first visit.',
    noteZh: '商圈人多，夜里也热闹，怕吵就订高楼层。',
    noteEn: 'Busy and lively into the night. Ask for a high floor if noise bothers you.',
    nightlyCny: { budget: [250, 450], comfort: [500, 900], luxury: [1200, 2500] },
  },
  {
    id: 'stay_jingan',
    citySlug: 'shanghai',
    nameZh: '静安寺·南京西路',
    nameEn: "Jing'an Temple and West Nanjing Road",
    near: ['poi_jingan', 'poi_wukang'],
    whyZh: '地铁 2、7、14 号线经过静安寺站。离静安的餐厅和武康路近，梧桐树下的街区比南京东路安静。',
    whyEn: "Metro lines 2, 7 and 14 stop at Jing'an Temple. Close to the Jing'an restaurants and Wukang Road, and quieter than East Nanjing Road.",
    noteZh: '高档酒店多，经济型的选择少一些。',
    noteEn: 'More upscale hotels here, fewer budget ones.',
    nightlyCny: { budget: [280, 480], comfort: [550, 1000], luxury: [1300, 2800] },
  },
  {
    id: 'stay_xinjiekou',
    citySlug: 'nanjing',
    nameZh: '新街口',
    nameEn: 'Xinjiekou',
    near: ['poi_njmuseum', 'poi_jiming'],
    whyZh: '南京市中心，地铁 1、2 号线在这里换乘。坐 1 号线直达南京南站，坐高铁来去最方便。',
    whyEn: 'The centre of Nanjing, where metro lines 1 and 2 meet. Line 1 runs straight to Nanjing South station for the high-speed train.',
    noteZh: '商场和餐厅最集中，吃饭选择多。',
    noteEn: 'The most shops and restaurants in one place.',
    nightlyCny: { budget: [180, 350], comfort: [350, 700], luxury: [800, 1800] },
  },
  {
    id: 'stay_fuzimiao',
    citySlug: 'nanjing',
    nameZh: '夫子庙·老门东',
    nameEn: 'Fuzimiao and Laomendong',
    near: ['poi_fuzimiao', 'poi_laomendong', 'poi_zhonghua'],
    whyZh: '步行就到秦淮河、老门东和中华门，晚上看完灯船走回去就到。地铁 3 号线从夫子庙站直达南京南站。',
    whyEn: 'Walk to the Qinhuai River, Laomendong and Zhonghua Gate, and walk home after the evening boats. Metro line 3 runs from Fuzimiao straight to Nanjing South station.',
    noteZh: '节假日人非常多，房价也涨得最快，越早订越好。',
    noteEn: 'Very crowded on holidays, when prices here rise fastest. Book early.',
    nightlyCny: { budget: [200, 380], comfort: [400, 750], luxury: [850, 1800] },
  },
];
// Transit facts for each area, from the Baidu Baike station entries (lines served).
export const STAY_SOURCES = {
  stay_renmin: '百度百科「南京东路站」：上海地铁 2、10 号线',
  stay_jingan: '百度百科「静安寺站」：上海地铁 2、7、14 号线',
  stay_xinjiekou: '百度百科「新街口站」：南京地铁 1、2 号线；「南京南站」地铁站：1、3、6、S1、S3 号线',
  stay_fuzimiao: '百度百科「夫子庙站」：南京地铁 3、5 号线；「南京南站」地铁站：1、3、6、S1、S3 号线',
};

// Restaurants and stay areas the map page can open by id. Like the trip stops they carry only a
// name, which the map looks up by search, so no unverified coordinates are used. A stay area is
// searched by its first place ("南京东路·外滩" -> "南京东路"); the map finds a place, not a pair.
export function travelPlace(id) {
  const hit = RESTAURANTS.find((r) => r.id === id) || STAY_AREAS.find((a) => a.id === id);
  if (!hit) return null;
  const plain = hit.nameZh.replace(/（.*?）/g, '').trim();
  const parts = plain.split('·').map((part) => part.trim()).filter(Boolean);
  const aliases = [...new Set([plain, ...parts, plain.replace(/(菜馆|饭店|酒楼)$/, '')])].filter((w) => w.length >= 2);
  return { id: hit.id, citySlug: hit.citySlug, nameZh: parts[0], nameEn: hit.nameEn, aliases };
}
export const TRAVEL_PLACES = Object.fromEntries([...RESTAURANTS, ...STAY_AREAS].map((item) => [item.id, travelPlace(item.id)]));
