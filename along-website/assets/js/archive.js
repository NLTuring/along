// Archive page main logic
import { initSky, updateSkyGradient } from './sky.js';
import { initI18n, getLocale, t } from './i18n.js';
import { initArchiveScene, createOrbitControls, createRaycaster } from './archive-scene.js';

// Archive content database (simplified)
const ARCHIVE_CONTENT = {
  'jiming-temple': {
    titleZh: '鸡鸣寺·春日记忆',
    titleEn: 'Jiming Temple · Spring Memory',
    city: '南京',
    category: '寺庙',
    date: '2026年3月',
    bodyZh: `
      <p>春天的鸡鸣寺，樱花沿着台阶一路开到药师塔前。</p>
      <p>门票附送三支香。从寺庙后面有路可以走上明城墙，玄武湖就在脚下展开。三月下旬坡道上的樱花开满，记得早点来。</p>
      <h3>游览建议</h3>
      <p>• 最佳时间：早上 8:00-10:00，避开人流高峰</p>
      <p>• 门票：10元，含三支香</p>
      <p>• 游览时长：1-2小时</p>
      <p>• 交通：地铁3号线、4号线鸡鸣寺站</p>
    `,
    bodyEn: `
      <p>In spring, cherry blossoms line the steps all the way to the Yaoshi Pagoda at Jiming Temple.</p>
      <p>The entry ticket comes with three sticks of incense. From the back of the temple, a path climbs onto the Ming city wall, and Xuanwu Lake opens out below. In late March, the cherry trees on the slope are in full flower: come early.</p>
      <h3>Visiting Tips</h3>
      <p>• Best time: 8:00-10:00 AM, avoid crowds</p>
      <p>• Ticket: ¥10, includes three incense sticks</p>
      <p>• Duration: 1-2 hours</p>
      <p>• Transport: Metro Line 3/4, Jiming Temple Station</p>
    `,
  },
  'xuanwu-walk': {
    titleZh: '玄武湖·晨间漫步',
    titleEn: 'Xuanwu Lake · Morning Walk',
    city: '南京',
    category: '公园',
    date: '2026年4月',
    bodyZh: `
      <p>清晨的玄武湖，薄雾还没散尽，湖面上波光粼粼。</p>
      <p>环湖步道适合慢跑和散步，湖心岛的梁洲、菱洲、翠洲各有特色。春天可以看樱花，夏天看荷花，秋天看芦苇。</p>
      <h3>游览建议</h3>
      <p>• 开放时间：全天免费开放</p>
      <p>• 推荐路线：玄武门入口 → 环洲 → 梁洲 → 翠洲</p>
      <p>• 游览时长：2-3小时</p>
      <p>• 最佳季节：春季（樱花）、夏季（荷花）</p>
    `,
    bodyEn: `
      <p>At dawn, Xuanwu Lake is still veiled in morning mist, with light dancing on the water.</p>
      <p>The lakeside path is perfect for jogging and walking. The islands—Liangzhou, Lingzhou, and Cuizhou—each have their own character. Cherry blossoms in spring, lotus in summer, reeds in autumn.</p>
      <h3>Visiting Tips</h3>
      <p>• Hours: Open 24/7, free admission</p>
      <p>• Recommended route: Xuanwu Gate → Huanzhou → Liangzhou → Cuizhou</p>
      <p>• Duration: 2-3 hours</p>
      <p>• Best seasons: Spring (cherry), Summer (lotus)</p>
    `,
  },
  'volunteer-lake': {
    titleZh: '志愿者·湖边相伴',
    titleEn: 'Volunteer · Lakeside Companion',
    city: '南京',
    category: '故事',
    date: '2026年5月',
    bodyZh: `
      <p>这是一次由志愿者陪同的玄武湖游览记录。</p>
      <p>志愿者小王是南京本地大学生，周末在Along平台上注册为本地伙伴。他带着行动不便的李奶奶，从玄武门进入，沿着无障碍通道慢慢走到环洲。</p>
      <p>"以前都是我推着老伴来，现在有志愿者帮忙，我们俩都能坐着轮椅看风景了。"李奶奶说。</p>
      <h3>志愿者陪游</h3>
      <p>• Along平台为行动不便的长者提供志愿者陪同服务</p>
      <p>• 志愿者经过培训，了解无障碍路线</p>
      <p>• 可提前预约，按时间和需求匹配</p>
      <p>• 费用：志愿者服务免费，可自愿打赏</p>
    `,
    bodyEn: `
      <p>This is a record of a volunteer-accompanied visit to Xuanwu Lake.</p>
      <p>Volunteer Xiao Wang, a local university student, registered as a local friend on the Along platform. He accompanied Mrs. Li, who has mobility challenges, entering through Xuanwu Gate and slowly walking along the accessible path to Huanzhou.</p>
      <p>"I used to push my husband here. Now with volunteer help, we can both enjoy the scenery from our wheelchairs," Mrs. Li said.</p>
      <h3>Volunteer Companionship</h3>
      <p>• Along platform provides volunteer companions for seniors with mobility needs</p>
      <p>• Volunteers are trained and know accessible routes</p>
      <p>• Book in advance, matched by time and needs</p>
      <p>• Cost: Volunteer service is free, tips welcome</p>
    `,
  },
  'warm-company': {
    titleZh: '温暖·同行记',
    titleEn: 'Warm Companionship',
    city: '南京',
    category: '故事',
    date: '2026年6月',
    bodyZh: `
      <p>六月的南京，阳光正好。</p>
      <p>退休教师张老师通过Along平台预约了一位持证导游陈佳佳。两人约在夫子庙见面，一起逛老门东，吃鸭血粉丝汤，走到秦淮河边看灯。</p>
      <p>"我一个人不敢出门，怕走丢。有人陪着，胆子大多了。"张老师说。陈佳佳会说英语，还帮张老师翻译菜单，教他用手机支付。</p>
      <h3>本地伙伴服务</h3>
      <p>• 持证导游提供专业讲解和陪同服务</p>
      <p>• 可选语言、主题、时段</p>
      <p>• 按小时计费，价格透明</p>
      <p>• 评价系统保障服务质量</p>
    `,
    bodyEn: `
      <p>June in Nanjing, the weather is just right.</p>
      <p>Retired teacher Mr. Zhang booked licensed guide Chen Jiajia through the Along platform. They met at Fuzimiao, explored Laomendong together, had duck blood vermicelli soup, and walked to the Qinhuai River to see the lanterns.</p>
      <p>"I'm afraid to go out alone, worried I'll get lost. With someone accompanying me, I'm much braver," Mr. Zhang said. Chen Jiajia speaks English, helped Mr. Zhang translate menus, and taught him mobile payments.</p>
      <h3>Local Friend Service</h3>
      <p>• Licensed guides provide professional guidance and companionship</p>
      <p>• Choose by language, theme, time slot</p>
      <p>• Hourly rate, transparent pricing</p>
      <p>• Review system ensures quality</p>
    `,
  },
  'company-photo': {
    titleZh: '陪伴·镜头瞬间',
    titleEn: 'Companion · Captured Moment',
    city: '南京',
    category: '故事',
    date: '2026年7月',
    bodyZh: `
      <p>在中山陵的392级台阶前，志愿者小李帮王大爷拍了一张照片。</p>
      <p>王大爷坐在轮椅上，背后是绿树葱茏的紫金山。"以前能爬上去，现在爬不动了。不过在这里拍一张，也挺好。"</p>
      <p>志愿者小李用Along App的短片功能，把六张旅途照片做成了一分钟的纪念短片，配上音乐和字幕，发给了王大爷的女儿。</p>
      <h3>影像记录</h3>
      <p>• Along App内置短片制作功能</p>
      <p>• 选择6张照片，自动生成15-60秒短片</p>
      <p>• 多种风格和配乐可选</p>
      <p>• 可分享给家人朋友</p>
    `,
    bodyEn: `
      <p>At the foot of the 392 steps at Sun Yat-sen Mausoleum, volunteer Xiao Li took a photo for Mr. Wang.</p>
      <p>Mr. Wang sat in his wheelchair with the lush green Purple Mountain behind him. "I used to climb up there. Can't do it now. But a photo here is pretty good too."</p>
      <p>Volunteer Xiao Li used the Along App's film feature to turn six travel photos into a one-minute memorial film with music and subtitles, and sent it to Mr. Wang's daughter.</p>
      <h3>Visual Memory</h3>
      <p>• Along App has built-in film creation</p>
      <p>• Select 6 photos, auto-generate 15-60s film</p>
      <p>• Multiple styles and soundtracks available</p>
      <p>• Share with family and friends</p>
    `,
  },
  'corner-tower': {
    titleZh: '角楼·城市印记',
    titleEn: 'Corner Tower · City Mark',
    city: '南京',
    category: '建筑',
    date: '2026年8月',
    bodyZh: `
      <p>南京明城墙上的角楼，是城市的标志性建筑。</p>
      <p>Along App的3D文创功能，可以把旅途照片做成立体纪念品。选一张角楼的照片，挑选外形（拱形、椭圆、花边、圆角方形），调整照片大小，AI自动识别人物并刻成浮雕。</p>
      <p>生成的3D模型可以导出为GLB或STL格式，用于3D打印。也可以直接在App里预览，旋转查看效果。</p>
      <h3>3D数字纪念品</h3>
      <p>• 上传旅行照片，选择产品类型（冰箱贴/钥匙扣）</p>
      <p>• AI识别人物，生成浮雕效果</p>
      <p>• 支持导出GLB、STL和预览图</p>
      <p>• 可本地收藏，暂不支持实物订购</p>
    `,
    bodyEn: `
      <p>The corner tower on Nanjing's Ming city wall is a city landmark.</p>
      <p>Along App's 3D keepsake feature turns travel photos into three-dimensional souvenirs. Select a photo of the corner tower, choose a shape (arch, oval, scallop, rounded), adjust photo size, and AI automatically detects figures and creates relief.</p>
      <p>The generated 3D model can be exported as GLB or STL format for 3D printing. You can also preview directly in the app and rotate to view.</p>
      <h3>3D Digital Keepsakes</h3>
      <p>• Upload travel photos, choose product type (magnet/keychain)</p>
      <p>• AI detects figures, generates relief effect</p>
      <p>• Export GLB, STL and preview images</p>
      <p>• Save locally, physical order not yet available</p>
    `,
  },
};

// Collected stamps (stored in localStorage)
function getCollectedStamps() {
  const stored = localStorage.getItem('along.stamps');
  return stored ? JSON.parse(stored) : [];
}

function addStamp(itemId) {
  const stamps = getCollectedStamps();
  if (!stamps.includes(itemId)) {
    stamps.push(itemId);
    localStorage.setItem('along.stamps', JSON.stringify(stamps));
  }
  return stamps;
}

function hasStamp(itemId) {
  return getCollectedStamps().includes(itemId);
}

// Initialize archive page
document.addEventListener('DOMContentLoaded', async () => {
  initI18n();
  
  const skyEl = document.getElementById('sky');
  initSky(skyEl);
  updateSkyGradient(skyEl);
  
  const canvas = document.getElementById('archiveCanvas');
  const loading = document.getElementById('archiveLoading');
  const infoPanel = document.getElementById('archiveInfo');
  const detailModal = document.getElementById('archiveDetail');
  
  let selectedItem = null;
  
  // Initialize 3D scene
  try {
    const { scene, camera, renderer, loadedItems } = await initArchiveScene(canvas);
    const controls = createOrbitControls(canvas, camera);
    const raycaster = createRaycaster(canvas, camera, loadedItems);
    
    loading.classList.add('is-hidden');
    
    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      controls.animate();
      
      // Subtle floating animation for items
      loadedItems.forEach((item, index) => {
        item.rotation.y += 0.001;
        item.position.y += Math.sin(Date.now() * 0.001 + index) * 0.05;
      });
      
      renderer.render(scene, camera);
    }
    animate();
    
    // Handle window resize
    window.addEventListener('resize', () => {
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    });
    
    // Click on models
    canvas.addEventListener('click', (event) => {
      const item = raycaster.onClick(event);
      if (item && item.id) {
        selectedItem = item;
        showInfo(item);
      } else {
        hideInfo();
      }
    });
    
    // Control buttons
    document.getElementById('resetView').addEventListener('click', () => {
      controls.reset();
    });
    
    document.getElementById('autoRotate').addEventListener('click', () => {
      const isRotating = controls.toggleAutoRotate();
      const btn = document.getElementById('autoRotate');
      btn.style.opacity = isRotating ? '1' : '0.7';
    });
    
    document.getElementById('openArchive').addEventListener('click', () => {
      if (selectedItem) openDetail(selectedItem);
    });
    
    document.getElementById('stampArchive').addEventListener('click', () => {
      if (selectedItem) {
        addStamp(selectedItem.id);
        updateStampUI(selectedItem.id);
      }
    });
    
    document.getElementById('closeDetail').addEventListener('click', closeDetail);
    document.getElementById('stampInDetail').addEventListener('click', () => {
      if (selectedItem) {
        addStamp(selectedItem.id);
        updateStampUI(selectedItem.id);
      }
    });
    
    // Close detail on background click
    detailModal.addEventListener('click', (e) => {
      if (e.target === detailModal) closeDetail();
    });
    
  } catch (error) {
    console.error('Failed to initialize archive scene:', error);
    loading.innerHTML = '<p>加载失败，请刷新页面重试</p>';
  }
  
  function showInfo(item) {
    const locale = getLocale();
    const titleKey = locale === 'zh' ? 'titleZh' : 'titleEn';
    
    document.getElementById('infoTitle').textContent = item[titleKey];
    document.getElementById('infoMeta').textContent = `${item.city} · ${item.category}`;
    
    infoPanel.classList.add('is-visible');
  }
  
  function hideInfo() {
    selectedItem = null;
    infoPanel.classList.remove('is-visible');
  }
  
  function openDetail(item) {
    const locale = getLocale();
    const content = ARCHIVE_CONTENT[item.id];
    
    if (!content) {
      console.warn('No content for', item.id);
      return;
    }
    
    const titleKey = locale === 'zh' ? 'titleZh' : 'titleEn';
    const bodyKey = locale === 'zh' ? 'bodyZh' : 'bodyEn';
    
    document.getElementById('detailTitle').textContent = content[titleKey];
    document.getElementById('detailCity').textContent = content.city;
    document.getElementById('detailCategory').textContent = content.category;
    document.getElementById('detailDate').textContent = content.date;
    document.getElementById('detailBody').innerHTML = content[bodyKey];
    
    updateStampUI(item.id);
    detailModal.classList.add('is-open');
  }
  
  function closeDetail() {
    detailModal.classList.remove('is-open');
  }
  
  function updateStampUI(itemId) {
    const stamped = hasStamp(itemId);
    const statusEl = document.getElementById('stampStatus');
    const stampBtn = document.getElementById('stampInDetail');
    const stampIcon = document.querySelector('.stamp-icon');
    
    if (stamped) {
      statusEl.textContent = '已盖章收藏';
      stampBtn.textContent = '已收藏';
      stampBtn.disabled = true;
      stampIcon.classList.add('is-collected');
    } else {
      statusEl.textContent = '点击盖章收藏';
      stampBtn.textContent = '盖章收藏';
      stampBtn.disabled = false;
      stampIcon.classList.remove('is-collected');
    }
  }
});
