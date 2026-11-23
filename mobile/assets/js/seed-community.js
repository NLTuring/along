// Along mobile — curated example stories, their invented demo authors and sample comments.
// These are product examples, not community submissions. Readers can open them, like, comment,
// follow the author and message them; all of that is kept on this phone by social.js and never
// uploaded. Author replies in messages are prepared sample lines, not a real person answering.
const POSTS = [
  {
    id: 'sample_bund_friends', kind: 'SAMPLE', status: 'VISIBLE',
    poiId: 'poi_ferry', city: 'shanghai', photo: 'img/along-samples/along-shanghai-friends.png',
    altEn: 'Three smiling travellers on the Bund with the Pudong skyline behind them',
    altZh: '三位旅人在外滩合影，身后是浦东天际线',
    titleEn: 'First morning on the Bund', titleZh: '外滩的第一个早晨',
    textEn: 'We landed at six and were on the Bund by nine, still in yesterday\u2019s clothes. Our local friend said the light is softest before ten and the crowds come after. Then she took us across on the two-yuan ferry, which turned out to be the best view of the whole trip.',
    textZh: '早上六点落地，九点就站在了外滩，衣服都没来得及换。本地伙伴说十点前光线最柔，人也少。拍完照她带我们坐两块钱的轮渡过江，结果那是整趟旅行里最好的风景。',
    authorEn: 'Maya · first time in China', authorZh: 'Maya · 第一次来中国',
    tagsEn: ['Shanghai', 'Ferry', 'First day'], tagsZh: ['上海', '轮渡', '第一天'], likes: 128, comments: 14,
  },
  {
    id: 'sample_temple_heaven', kind: 'SAMPLE', status: 'VISIBLE',
    city: 'beijing', photo: 'img/along-samples/along-temple-friends.png',
    altEn: 'Four friends in winter coats in front of the Hall of Prayer at the Temple of Heaven',
    altZh: '四位穿冬装的朋友在天坛祈年殿前合影',
    titleEn: 'Cold hands, warm Temple of Heaven', titleZh: '手很冷，天坛很暖',
    textEn: 'Minus three degrees and we still stayed two hours. In the park outside, retirees were dancing, singing opera and playing cards, and one uncle taught us a few kicks of jianzi. Go in through the east gate: you see daily life first, then the Hall of Prayer.',
    textZh: '零下三度，我们还是待了两个小时。公园里大爷大妈在跳舞、唱戏、打牌，还有一位大爷教我们踢了几下毽子。建议从东门进：先看生活，再看祈年殿。',
    authorEn: 'Tom & friends · exchange students', authorZh: 'Tom 和朋友们 · 交换生',
    tagsEn: ['Beijing', 'Winter', 'Park life'], tagsZh: ['北京', '冬天', '公园日常'], likes: 96, comments: 9,
  },
  {
    id: 'sample_forbidden_city', kind: 'SAMPLE', status: 'VISIBLE',
    city: 'beijing', photo: 'img/along-samples/along-forbidden-city.png',
    altEn: 'A group of eleven young travellers lined up on a terrace in the Forbidden City',
    altZh: '十一位年轻旅人在故宫平台上站成一排合影',
    titleEn: 'Eleven of us, one ticket rule', titleZh: '十一个人，一条购票规则',
    textEn: 'Tickets are released seven days ahead and every visitor needs their own passport number, so book for the whole group in one go. We came in through the Meridian Gate and walked straight to the back. The front halls are busiest; the Imperial Garden at the end is a good place to rest your feet.',
    textZh: '门票提前七天放出，每个人都要填自己的护照号，所以一次把全组的票订好。我们从午门进，一路直接走到最后。前面几座大殿人最多，最后的御花园很适合歇脚。',
    authorEn: 'A university study tour', authorZh: '某大学游学团',
    tagsEn: ['Beijing', 'Booking', 'Group travel'], tagsZh: ['北京', '预约', '团体出行'], likes: 74, comments: 21,
  },
  {
    id: 'sample_red_lanterns', kind: 'SAMPLE', status: 'VISIBLE',
    poiId: 'poi_fuzimiao', city: 'nanjing', photo: 'img/along-samples/along-lanterns.png',
    altEn: 'A traveller in a straw hat looking up beneath rows of red lanterns',
    altZh: '一位戴草帽的旅人站在成排的红灯笼下抬头张望',
    titleEn: 'Under a sky of lanterns', titleZh: '一片灯笼做的天空',
    textEn: 'I didn\u2019t know where to look first. My guide said these lanterns go up for the new year and the lantern festival, and the best time is just after dusk, when they are lit but the sky is not yet black. Bring a small bill: someone will ask you to make a wish.',
    textZh: '一时不知道该先看哪里。向导说这些灯笼是为过年和元宵挂的，最好看的是刚入夜那一会儿，灯亮了，天还没全黑。带点零钱，会有人邀请你许个愿。',
    authorEn: 'Luca · travelling solo', authorZh: 'Luca · 一个人旅行',
    tagsEn: ['Nanjing', 'Festival', 'Night'], tagsZh: ['南京', '节庆', '夜景'], likes: 152, comments: 17,
  },
  {
    id: 'sample_fuzimiao_river', kind: 'SAMPLE', status: 'VISIBLE',
    poiId: 'poi_fuzimiao', city: 'nanjing', photo: 'img/places/fuzimiao.jpg',
    altEn: 'The great screen wall at Fuzimiao by the Qinhuai River',
    altZh: '秦淮河边夫子庙的大照壁',
    titleEn: 'The Qinhuai River after dark', titleZh: '入夜后的秦淮河',
    textEn: 'Take the boat once, then walk the same stretch on foot. From the water you see the lights; from the bank you see the people. The crab-roe soup dumplings near the screen wall are worth the queue.',
    textZh: '坐一次船，再把同一段路走一遍。从水上看灯，从岸上看人。照壁旁边那家蟹黄汤包，值得排一会儿队。',
    authorEn: 'Along field note', authorZh: '一起游现场笔记',
    tagsEn: ['Nanjing', 'River', 'Food'], tagsZh: ['南京', '河景', '美食'], likes: 63, comments: 5,
  },
  {
    id: 'sample_laomendong', kind: 'SAMPLE', status: 'VISIBLE',
    poiId: 'poi_laomendong', city: 'nanjing', photo: 'img/places/laomendong.jpg',
    altEn: 'Grey-brick houses and a lane in Laomendong, Nanjing',
    altZh: '南京老门东的青砖老屋与街巷',
    titleEn: 'Six snacks, one old street', titleZh: '六样小吃，一条老街',
    textEn: 'Duck-blood vermicelli soup, osmanthus rice cake, pan-fried buns, sesame flatbread, sweet tofu pudding, and a cup of rain-flower tea to finish. Six small things to eat, one old street to walk, no full meal required.',
    textZh: '鸭血粉丝汤、桂花糕、生煎、烧饼、甜豆花，最后来杯雨花茶。六样小吃，一条老街，不必坐下来吃一顿完整的饭。',
    authorEn: 'Along field note', authorZh: '一起游现场笔记',
    tagsEn: ['Nanjing', 'Street food'], tagsZh: ['南京', '街头小吃'], likes: 88, comments: 11,
  },
  {
    id: 'sample_jiming_spring', kind: 'SAMPLE', status: 'VISIBLE',
    poiId: 'poi_jiming', city: 'nanjing', photo: 'img/places/jiming.jpg',
    altEn: 'The pagoda and halls of Jiming Temple above the city',
    altZh: '鸡鸣寺的塔与殿宇，背后是南京城',
    titleEn: 'Incense, then the city wall', titleZh: '先上香，再上城墙',
    textEn: 'The entry ticket comes with three sticks of incense. From the back of the temple a path climbs onto the Ming city wall, and Xuanwu Lake opens out below. In late March the cherry trees on the slope are in full flower: come early.',
    textZh: '门票附送三支香。从寺庙后面有路可以走上明城墙，玄武湖就在脚下展开。三月下旬坡道上的樱花开满，记得早点来。',
    authorEn: 'Along field note', authorZh: '一起游现场笔记',
    tagsEn: ['Nanjing', 'Temple', 'Spring'], tagsZh: ['南京', '寺庙', '春天'], likes: 57, comments: 4,
  },
  {
    id: 'sample_nanjing_museum', kind: 'SAMPLE', status: 'VISIBLE',
    poiId: 'poi_njmuseum', city: 'nanjing', photo: 'img/places/nanjing-museum-02.jpg',
    altEn: 'The garden courtyard of Nanjing Museum',
    altZh: '南京博物院的庭园',
    titleEn: 'A museum that needs a whole afternoon', titleZh: '要留一整个下午的博物馆',
    textEn: 'Reserve first; entry is free but limited. Save the Republic-era hall for the hour when the crowds thin: it is a full street of shops and a tram you can walk through.',
    textZh: '先预约，免费但限流。把人少的时段留给民国馆：那里是一整条可以走进去的老街，还有一节电车。',
    authorEn: 'Along field note', authorZh: '一起游现场笔记',
    tagsEn: ['Nanjing', 'Museum', 'Free'], tagsZh: ['南京', '博物馆', '免费'], likes: 49, comments: 6,
  },
  {
    id: 'sample_zhongshan_steps', kind: 'SAMPLE', status: 'VISIBLE',
    poiId: 'poi_zhongshan', city: 'nanjing', photo: 'img/places/zhongshan-02.jpg',
    altEn: 'Carved stone and a tree-lined path at Sun Yat-sen Mausoleum',
    altZh: '中山陵的石雕纹样与林荫步道',
    titleEn: '392 steps, then a green sea', titleZh: '392 级台阶，然后是一片绿海',
    textEn: 'Most of the climb is gentle and there are benches every few landings. Turn around at the top: the whole Purple Mountain forest is below you. The sightseeing bus back down saves your knees.',
    textZh: '台阶大多很缓，每隔几层就有长椅。爬到顶回头看，整片紫金山的树林都在脚下。下山坐观光车，膝盖会感谢你。',
    authorEn: 'Along field note', authorZh: '一起游现场笔记',
    tagsEn: ['Nanjing', 'Hiking', 'History'], tagsZh: ['南京', '登高', '历史'], likes: 41, comments: 3,
  },
  {
    id: 'sample_yuyuan_morning', kind: 'SAMPLE', status: 'VISIBLE',
    poiId: 'poi_yuyuan', city: 'shanghai', photo: '',
    titleEn: 'Before ten in the old town', titleZh: '老城厢的十点之前',
    textEn: 'Go before ten. The old lanes behind the garden are still quiet, and the breakfast stalls are still frying.',
    textZh: '十点前出发，豫园后面的老巷子还很安静，早点摊还在炸油条。',
    authorEn: 'Along field note', authorZh: '一起游现场笔记',
    tagsEn: ['Shanghai', 'Morning'], tagsZh: ['上海', '早晨'], likes: 35, comments: 2,
  },
  {
    id: 'sample_westbund_light', kind: 'SAMPLE', status: 'VISIBLE',
    poiId: 'poi_westbund', city: 'shanghai', photo: '',
    titleEn: 'The river keeps the last light', titleZh: '江边留住最后一束光',
    textEn: 'The river keeps the last light. Bring a slow camera and no plan; rent a bike and ride the riverside path south.',
    textZh: '江边留住最后一束光。带一台慢相机，不必安排太多；租辆单车沿着滨江步道一路往南骑。',
    authorEn: 'Along field note', authorZh: '一起游现场笔记',
    tagsEn: ['Shanghai', 'Sunset', 'Cycling'], tagsZh: ['上海', '日落', '骑行'], likes: 52, comments: 4,
  },
  {
    id: 'sample_jiajia', kind: 'SAMPLE', status: 'VISIBLE',
    guideId: 'guide_jiajia', city: 'shanghai', photo: 'img/chen-jiajia.jpg',
    altEn: 'Portrait of Chen Jiajia, a volunteer local friend',
    altZh: '志愿伙伴陈佳佳的照片',
    titleEn: 'What a local friend really does', titleZh: '本地伙伴到底做什么',
    textEn: 'A local friend is often just someone who knows which lane to take slowly, which stall is worth the queue, and how to say \u201cnot too spicy\u201d.',
    textZh: '本地伙伴有时只是知道哪条巷子值得慢慢走，哪家摊子值得排队，以及怎么说“少放点辣”。',
    authorEn: 'Chen Jiajia · volunteer friend', authorZh: '陈佳佳 · 志愿伙伴',
    tagsEn: ['Local friend'], tagsZh: ['本地伙伴'], likes: 67, comments: 8,
  },
];

const AUTHOR_OF = {
  sample_bund_friends: 'author_maya', sample_temple_heaven: 'author_tom', sample_forbidden_city: 'author_studytour',
  sample_red_lanterns: 'author_luca', sample_jiajia: 'author_jiajia',
};

// Illustrative reactions by invented readers. They add no facts beyond the post they answer.
const c = (nameEn, nameZh, textEn, textZh) => ({ nameEn, nameZh, textEn, textZh });
const COMMENTS = {
  sample_bund_friends: [
    c('Ines', 'Ines', 'The ferry tip is going straight into my notes.', '轮渡这条我直接记进备忘录了。'),
    c('Kenji', 'Kenji', 'Same jet lag, same Bund, same smile. Lovely photo.', '一样的时差，一样的外滩，一样的笑容。照片真好。'),
    c('Sara', 'Sara', 'Did you go back at night too?', '晚上你们又去了一次吗？'),
  ],
  sample_temple_heaven: [
    c('Priya', 'Priya', 'Minus three and still two hours. Respect.', '零下三度还待了两小时，佩服。'),
    c('Ben', 'Ben', 'I want to learn jianzi now.', '我现在也想学踢毽子了。'),
  ],
  sample_forbidden_city: [
    c('Lena', 'Lena', 'Thank you for the one-booking-for-everyone tip. Planning a group trip now.', '谢谢“一次订好全组”这个提醒，正在计划团队出行。'),
    c('Marco', 'Marco', 'Eleven people in one photo and everyone has their eyes open. Impressive.', '十一个人一张照片，居然没人闭眼，厉害。'),
    c('Aiko', 'Aiko', 'Saving the garden-at-the-end idea for tired feet.', '“最后去御花园歇脚”这个主意我收下了。'),
  ],
  sample_red_lanterns: [
    c('Noor', 'Noor', 'That moment between lit lanterns and a dark sky sounds perfect.', '灯亮了、天还没黑的那一刻，听起来太美了。'),
    c('Tom', 'Tom', 'What did you wish for?', '你许了什么愿？'),
  ],
  sample_fuzimiao_river: [
    c('Hana', 'Hana', 'Boat first, then on foot. I like that order.', '先坐船，再步行，这个顺序我喜欢。'),
    c('Felix', 'Felix', 'Noted the soup dumplings.', '汤包记下了。'),
  ],
  sample_laomendong: [
    c('Olivia', 'Olivia', 'Six snacks instead of one meal is my kind of plan.', '六样小吃代替一顿正餐，正合我意。'),
    c('Raj', 'Raj', 'Which one was your favourite?', '你最喜欢哪一样？'),
  ],
  sample_jiming_spring: [
    c('Emma', 'Emma', 'Temple, then the wall, then the lake. What a walk.', '先寺庙，再城墙，再看湖，好一条路线。'),
    c('Yusuf', 'Yusuf', 'Hoping to catch the cherry blossom this year.', '希望今年能赶上樱花。'),
  ],
  sample_nanjing_museum: [
    c('Clara', 'Clara', 'A whole street inside a museum? Adding it to the list.', '博物馆里有一整条街？加进清单了。'),
    c('Diego', 'Diego', 'Thanks for the reminder to reserve first.', '谢谢提醒先预约。'),
  ],
  sample_zhongshan_steps: [
    c('Mia', 'Mia', 'My knees thank you for the bus tip in advance.', '我的膝盖提前谢谢你的观光车建议。'),
    c('Arjun', 'Arjun', 'Turning around at the top is the best part of any climb.', '爬到顶回头看，永远是最好的部分。'),
  ],
  sample_yuyuan_morning: [
    c('Zoe', 'Zoe', 'Quiet lanes and breakfast stalls. Setting an alarm.', '安静的巷子加早点摊，定好闹钟了。'),
    c('Leo', 'Leo', 'Before ten, got it.', '十点前，收到。'),
  ],
  sample_westbund_light: [
    c('Anna', 'Anna', 'A slow camera and no plan sounds like the right evening.', '一台慢相机，不做计划，这才像样的傍晚。'),
    c('Sam', 'Sam', 'Riding south along the river is now on my list.', '沿江往南骑，已加进清单。'),
  ],
  sample_jiajia: [
    c('Maya', 'Maya', 'Knowing which lane to take slowly is exactly what we needed.', '知道哪条巷子值得慢慢走，正是我们需要的。'),
    c('Ken', 'Ken', 'Teach me how to say “not too spicy”, please.', '请教我怎么说“少放点辣”。'),
    c('Julia', 'Julia', 'This makes the idea of a local friend much less scary.', '这让“本地伙伴”听起来没那么让人紧张了。'),
  ],
};

// Each example's count of comments is the number a reader can actually open.
export const SAMPLE_POSTS = POSTS.map((post) => {
  const sampleComments = (COMMENTS[post.id] || []).map((comment, index) => ({ id: `${post.id}_c${index + 1}`, ...comment }));
  return { ...post, authorId: AUTHOR_OF[post.id] || 'author_fieldnote', sampleComments, comments: sampleComments.length };
});

// Invented demo personas behind the examples. Replies are prepared sample lines.
export const SAMPLE_AUTHORS = {
  author_maya: {
    id: 'author_maya', nameEn: 'Maya', nameZh: 'Maya', photo: '',
    taglineEn: 'First time in China', taglineZh: '第一次来中国',
    bioEn: 'Landed in Shanghai with two friends and a very full camera roll. Writing down the small things that made the first days easy.',
    bioZh: '和两个朋友落地上海，相册塞得满满的。记下那些让头几天变轻松的小事。',
    repliesEn: ['Hi, thanks for writing. The ferry really was the best part of our first day.', 'Go before ten if you can. The light is softer and it is quieter.', 'Our local friend made a big difference. Ask them about the small things.', 'Have a great trip, and enjoy the river.'],
    repliesZh: ['你好，谢谢留言。轮渡真的是我们第一天最棒的部分。', '能的话十点前去，光线更柔，人也少。', '本地伙伴帮了大忙，小事都可以问问他们。', '祝旅途愉快，好好看看江景。'],
  },
  author_tom: {
    id: 'author_tom', nameEn: 'Tom & friends', nameZh: 'Tom 和朋友们', photo: '',
    taglineEn: 'Exchange students', taglineZh: '交换生',
    bioEn: 'Four exchange students spending a winter in Beijing. We like parks, morning crowds and anyone willing to teach us a game.',
    bioZh: '四个在北京过冬的交换生。喜欢公园、早晨的人群，也喜欢愿意教我们玩游戏的人。',
    repliesEn: ['Hey, thanks for the message.', 'Wear proper gloves. We did not, and we regretted it.', 'The park life before the Hall of Prayer was the highlight for us.', 'Hope you get to try jianzi too.'],
    repliesZh: ['嗨，谢谢你的消息。', '记得戴好手套，我们没戴，后悔了。', '对我们来说，祈年殿之前的公园日常才是亮点。', '希望你也有机会试试踢毽子。'],
  },
  author_studytour: {
    id: 'author_studytour', nameEn: 'University study tour', nameZh: '某大学游学团', photo: '',
    taglineEn: 'Group travel', taglineZh: '团体出行',
    bioEn: 'A group of eleven students travelling together. We share what helped a large group move through busy places.',
    bioZh: '十一位同学一起出行。分享让一大群人顺利走过热门景点的经验。',
    repliesEn: ['Thanks for writing to us.', 'Booking for the whole group in one go saved us a lot of stress.', 'Agree on a meeting point before you go in. It helps with a big group.', 'Enjoy your visit.'],
    repliesZh: ['谢谢你给我们留言。', '一次把全组的票订好，省了我们很多麻烦。', '进去之前先约好集合点，人多的时候很有用。', '祝参观愉快。'],
  },
  author_luca: {
    id: 'author_luca', nameEn: 'Luca', nameZh: 'Luca', photo: '',
    taglineEn: 'Travelling solo', taglineZh: '一个人旅行',
    bioEn: 'Travelling on my own, slowly. I keep a note of moments when I do not know where to look first.',
    bioZh: '一个人慢慢地旅行。记下那些“不知道该先看哪里”的瞬间。',
    repliesEn: ['Ciao, thanks for the message.', 'Just after dusk is the moment. Stay a little longer than you planned.', 'Travelling alone was easier than I expected, especially with a guide for an evening.', 'Buon viaggio.'],
    repliesZh: ['Ciao，谢谢你的消息。', '刚入夜那一会儿最好看，比计划多待一会儿吧。', '一个人旅行比想象中容易，尤其是晚上有向导带着的时候。', '一路顺风。'],
  },
  author_jiajia: {
    id: 'author_jiajia', nameEn: 'Chen Jiajia', nameZh: '陈佳佳', photo: 'img/chen-jiajia.jpg', guideId: 'guide_jiajia',
    taglineEn: 'Volunteer local friend', taglineZh: '志愿伙伴',
    bioEn: 'A design student in Shanghai who still shoots on film. Happy to share the lanes I actually walk on weekends.',
    bioZh: '在上海读设计，还在用胶片拍照。很乐意分享我周末真正会走的那些巷子。',
    repliesEn: ['Hi, thanks for your message.', 'If you want to walk together, you can find my free times on my local friend page.', 'Slow lanes, a queue worth joining and the right words for ordering. That is most of it.', 'Have a lovely trip.'],
    repliesZh: ['你好，谢谢你的留言。', '想一起走走的话，可以在我的伙伴页面看可约时间。', '慢慢走的巷子、值得排的队、点菜用的那几句话，差不多就是全部了。', '祝旅途愉快。'],
  },
  author_fieldnote: {
    id: 'author_fieldnote', nameEn: 'Along field note', nameZh: '一起游现场笔记', photo: '',
    taglineEn: 'Along editors', taglineZh: '一起游编辑部',
    bioEn: 'Short notes from the places in Along trips: what to see first, when to go and where to rest.',
    bioZh: '来自一起游行程地点的简短笔记：先看什么、什么时候去、在哪里歇脚。',
    repliesEn: ['Thanks for writing to Along field notes.', 'Every note links to its place. Open it on the map to plan your way there.', 'If something has changed on the ground, opening hours and tickets are always worth checking before you go.', 'Enjoy the trip.'],
    repliesZh: ['谢谢你给一起游现场笔记留言。', '每条笔记都关联了地点，在地图上打开就能规划怎么去。', '现场情况可能会变，出发前最好再确认开放时间和门票。', '祝旅途愉快。'],
  },
};
