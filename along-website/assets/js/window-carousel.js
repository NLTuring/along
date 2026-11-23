// Window turning carousel — 6 scenes from Along mobile
const WINDOW_SCENES = [
  {
    id: 'shanghai-pearl-day',
    src: '/assets/img/window/shanghai-pearl-day.jpg',
    nameZh: '上海 · 东方明珠',
    nameEn: 'Oriental Pearl, Shanghai',
    author: 'alan braeley',
  },
  {
    id: 'nanjing-xuanwu-bridge',
    src: '/assets/img/window/nanjing-xuanwu-bridge.jpg',
    nameZh: '南京 · 玄武湖',
    nameEn: 'Xuanwu Lake, Nanjing',
    author: 'kimi lee',
  },
  {
    id: 'shanghai-lujiazui-night',
    src: '/assets/img/window/shanghai-lujiazui-night.jpg',
    nameZh: '上海 · 陆家嘴夜景',
    nameEn: 'Lujiazui at night, Shanghai',
    author: 'Lijian (Richard) Zhu',
  },
  {
    id: 'nanjing-lake-skyline',
    src: '/assets/img/window/nanjing-lake-skyline.jpg',
    nameZh: '南京 · 湖光与城市',
    nameEn: 'Lake and city, Nanjing',
    author: 'Cheng Shi Song',
  },
  {
    id: 'shanghai-pearl-night',
    src: '/assets/img/window/shanghai-pearl-night.jpg',
    nameZh: '上海 · 东方明珠之夜',
    nameEn: 'Oriental Pearl by night, Shanghai',
    author: '蔡 世宏',
  },
  {
    id: 'nanjing-jiming',
    src: '/assets/img/window/nanjing-jiming.jpg',
    nameZh: '南京 · 鸡鸣寺',
    nameEn: 'Jiming Temple, Nanjing',
    author: 'Nathan Wong',
  },
];

const SCENE_DURATION = 5200;
const SLAT_COUNT = 6;
const SLAT_DURATION = 720;
const SLAT_SPREAD = 420;

function shuffleDelays(count, spread) {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const step = spread / count;
  const delays = new Array(count);
  order.forEach((row, rank) => {
    delays[row] = Math.round(rank * step + Math.random() * step * 0.6);
  });
  return delays;
}

export function initWindowCarousel(container, imageEl, captionEl, locale = 'zh') {
  let currentIndex = 0;
  let timer = null;
  let turning = false;

  function updateCaption(scene) {
    const nameKey = locale === 'zh' ? 'nameZh' : 'nameEn';
    const locationEl = captionEl.querySelector('.window-caption__location');
    const creditEl = captionEl.querySelector('.window-caption__credit');
    
    if (locationEl) locationEl.textContent = scene[nameKey];
    if (creditEl) creditEl.textContent = `照片：${scene.author}`;
  }

  async function turnWindow() {
    if (turning || document.hidden) return;
    
    const fromIndex = currentIndex;
    const toIndex = (currentIndex + 1) % WINDOW_SCENES.length;
    const toScene = WINDOW_SCENES[toIndex];
    
    turning = true;
    
    // Create slats container
    const slatsContainer = document.createElement('div');
    slatsContainer.className = 'window-slats';
    slatsContainer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    
    const delays = shuffleDelays(SLAT_COUNT, SLAT_SPREAD);
    const height = container.offsetHeight / SLAT_COUNT;
    
    delays.forEach((delay, row) => {
      const slat = document.createElement('div');
      slat.className = 'window-slat';
      slat.style.cssText = `
        position:absolute;
        left:0;
        top:${row * height}px;
        width:100%;
        height:${height}px;
        background:url('${WINDOW_SCENES[fromIndex].src}') center/cover no-repeat;
        background-position-y:${-row * height}px;
        animation:slat-exit ${SLAT_DURATION}ms cubic-bezier(0.55,0,0.35,1) ${delay}ms forwards;
      `;
      slatsContainer.appendChild(slat);
    });
    
    container.style.position = 'relative';
    container.appendChild(slatsContainer);
    
    // Preload new image
    const img = new Image();
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
      img.src = toScene.src;
    });
    
    // Update image underneath
    imageEl.src = toScene.src;
    imageEl.alt = toScene.nameZh;
    updateCaption(toScene);
    currentIndex = toIndex;
    
    // Clean up after animation
    setTimeout(() => {
      slatsContainer.remove();
      turning = false;
    }, Math.max(...delays) + SLAT_DURATION + 100);
  }

  function schedule() {
    clearTimeout(timer);
    if (!document.hidden) {
      timer = setTimeout(() => {
        turnWindow().then(schedule);
      }, SCENE_DURATION);
    }
  }

  function handleVisibility() {
    if (!document.hidden && !turning) schedule();
  }

  // Initialize
  updateCaption(WINDOW_SCENES[0]);
  schedule();
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}

// Add CSS for slat animation
const style = document.createElement('style');
style.textContent = `
@keyframes slat-exit {
  from { transform: translateX(0); }
  to { transform: translateX(-104%); }
}
@media (prefers-reduced-motion: reduce) {
  .window-slat { display: none; }
}
`;
document.head.appendChild(style);
