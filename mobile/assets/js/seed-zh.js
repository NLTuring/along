// Along mobile — the Chinese for the seed content.
// seed.js and seed-places.js were written in English for visitors from abroad; place names
// already have both languages there. This file adds the rest for Chinese readers, keyed the
// same way, so the English records (and everything saved from them) stay as they are.
// seed-text.js picks between the two by the current language.

export const PLACE_ZH = {
  poi_yuyuan: { description: '十点前去。园子后面的小巷比广场清静。' },
  poi_westbund: { description: '租辆单车一路向北骑到龙美术馆。下午四点以后光线最好。' },
  poi_wukang: { description: '从街角的咖啡店出发，不看地图往南走，一路都是梧桐树荫。' },
  poi_jingan: { description: '订吧台位，不要订桌位。记得问当季菜单。' },
  poi_ferry: { description: '两块钱，五分钟，全城最好的夜景。' },
  poi_shmuseum: { description: '需要提前在线预约。青铜馆最值得看。' },
  poi_njmuseum: { description: '先别急着看主馆，让人记住的是民国馆。' },
  poi_laomendong: { description: '一路吃小吃就好，别坐下来吃正餐，有六样东西值得尝。' },
  poi_fuzimiao: { description: '晚上八点以后再坐船。先到桥上站一会儿，再决定。' },
  poi_zhonghua: { description: '上城墙顶走一走，上面要凉快五度。' },
  poi_zhongshan: { description: '免费，但需要预约时段。趁十点前爬完 392 级台阶，很值得。' },
  poi_jiming: { description: '登塔看城墙，再沿着城墙往北走。' },
};

// Same days and stops, in the same order, as PLAN_TEMPLATE.daysData.
export const PLAN_ZH = [
  {
    title: '慢慢走上海',
    rainBackup: '把滨江换成上海当代艺术博物馆，再慢慢吃一顿午饭。',
    stops: [
      { poiId: 'poi_yuyuan', transport: '步行 12 分钟', note: '十点前去。' },
      { poiId: 'poi_westbund', transport: '地铁 25 分钟', note: '骑车去龙美术馆。' },
      { poiId: 'poi_jingan', transport: '地铁 20 分钟', note: '订吧台位。' },
      { poiId: 'poi_ferry', transport: '步行 8 分钟', note: '两块钱。' },
    ],
  },
  {
    title: '高铁一小时',
    rainBackup: '就待在南京博物院里，光民国馆就能看两个小时。',
    stops: [
      { poiId: 'poi_njmuseum', transport: '高铁 1 小时 15 分 + 地铁 20 分钟', note: '先看民国馆。' },
      { poiId: 'poi_laomendong', transport: '步行 10 分钟', note: '边走边吃，别坐下。' },
      { poiId: 'poi_zhonghua', transport: '步行 15 分钟', note: '上城墙顶走走。' },
      { poiId: 'poi_fuzimiao', transport: '步行 12 分钟', note: '八点后坐船。' },
    ],
  },
  {
    title: '绕远路回家',
    rainBackup: '武康路一带本来就是下小雨时最好看。',
    stops: [
      { poiId: 'poi_wukang', transport: '地铁 15 分钟', note: '先喝杯咖啡。' },
      { poiId: 'poi_shmuseum', transport: '地铁 25 分钟', note: '提前在线预约。' },
    ],
  },
];

// Topics are listed in the same order as the guide's English topics.
export const GUIDE_ZH = {
  guide_jiajia: {
    name: '陈佳佳',
    headline: '设计专业学生，胶片摄影爱好者',
    topics: ['摄影', '慢走漫游'],
    bio: '我在上海读设计，至今还在用胶片拍照。我会带你去我周末真正会走的那些巷子，拍出和别人不一样的照片。',
  },
  guide_zhangmin: {
    name: '张敏',
    headline: '社区向导，熟悉菜市场和小吃',
    topics: ['街头小吃', '市集'],
    bio: '我在离老门东两条街的地方长大，知道哪家摊子值得排队，哪家只是做游客生意。我们会像本地人一样，站着吃。',
  },
  guide_junjie: {
    name: '黄俊杰',
    headline: '建筑专业学生，城墙迷',
    topics: ['建筑', '历史'],
    bio: '我学建筑。我会带你看明白，为什么明城墙和三十年代的小洋楼讲的是同一个故事，以及该站在哪里看。',
  },
};

// One caption per shot, in the same order as the style's English captions.
export const CAPTIONS_ZH = {
  CHINA_TRAVEL: ['周五傍晚六点，到了。', '第一碗面，18 块。', '晚上八点的江边。', '高铁一小时。', '老街，新朋友。', '绕远路回家。'],
  STREET_FOOD: ['本地人排哪家，就排哪家。', '葱油拌面。', '一块钱？两块。', '先喝汤，再吃别的。', '这一周吃到最好的一口。', '到现在还在想。'],
  SLOW_WALK: ['今天不看地图。', '梧桐和咖啡。', '坐十分钟。', '绕个远路。', '一个还想再来的地方。', '这就是这趟旅行。'],
};
