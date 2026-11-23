// Minimal i18n for Along website — Chinese and English
const MESSAGES = {
  zh: {
    'site.title': 'Along · 一起游',
    'site.tagline': '透过窗看中国',
    'welcome.title': '向上拉开遮光板',
    'welcome.pull': '开始旅程',
    'nav.home': '首页',
    'nav.journey': '旅程',
    'nav.archive': '记忆馆',
    'nav.about': '关于',
    'window.credit': '照片：{author}',
    'journey.arrive.title': '落地',
    'journey.arrive.subtitle': '从你到达的那一刻开始',
    'journey.companion.title': '同游',
    'journey.companion.subtitle': '本地伙伴与志愿者',
    'journey.keepsake.title': '带走',
    'journey.keepsake.subtitle': '3D 数字纪念品',
    'archive.title': '记忆馆',
    'archive.subtitle': '旅程故事与地点档案',
    'archive.stamp': '盖章收藏',
    'about.title': '关于 Along',
    'about.tagline': 'AI 公益伴游与影像文旅',
    'about.mission': '为长者、残障伙伴与行动不便者提供旅行陪伴',
    'footer.team': 'Rank8848 团队',
    'footer.track': 'AI + 社会公益',
  },
  en: {
    'site.title': 'Along',
    'site.tagline': 'See China through the window',
    'welcome.title': 'Pull the shade up',
    'welcome.pull': 'Begin the journey',
    'nav.home': 'Home',
    'nav.journey': 'Journey',
    'nav.archive': 'Archive',
    'nav.about': 'About',
    'window.credit': 'Photo by {author}',
    'journey.arrive.title': 'Arrive',
    'journey.arrive.subtitle': 'From the moment you land',
    'journey.companion.title': 'Companion',
    'journey.companion.subtitle': 'Local friends and volunteers',
    'journey.keepsake.title': 'Take Home',
    'journey.keepsake.subtitle': '3D digital keepsakes',
    'archive.title': 'Memory Archive',
    'archive.subtitle': 'Travel stories and place records',
    'archive.stamp': 'Collect stamp',
    'about.title': 'About Along',
    'about.tagline': 'AI-powered companion travel & immersive tourism',
    'about.mission': 'Travel support for seniors, people with disabilities, and those with mobility challenges',
    'footer.team': 'Rank8848 Team',
    'footer.track': 'AI + Social Good',
  },
};

let currentLocale = 'zh';

export function setLocale(locale) {
  currentLocale = ['zh', 'en'].includes(locale) ? locale : 'zh';
  document.documentElement.lang = currentLocale;
  localStorage.setItem('along.locale', currentLocale);
}

export function getLocale() {
  return currentLocale;
}

export function t(key, params = {}) {
  let text = MESSAGES[currentLocale][key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, v);
  }
  return text;
}

export function initI18n() {
  const saved = localStorage.getItem('along.locale');
  const browser = navigator.language?.split('-')[0];
  setLocale(saved || browser || 'zh');
}
