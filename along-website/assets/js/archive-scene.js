// Archive 3D scene — memory gallery with keepsake models arranged in space
import * as THREE from '/three.bundle.js';
import { initSky, updateSkyGradient } from './sky.js';
import { initI18n, getLocale, t } from './i18n.js';

// Archive items — keepsakes representing travel stories and places
const ARCHIVE_ITEMS = [
  {
    id: 'jiming-temple',
    modelPath: '/assets/models/jiming-temple.glb',
    titleZh: '鸡鸣寺·春日记忆',
    titleEn: 'Jiming Temple · Spring Memory',
    city: '南京',
    category: '寺庙',
    date: '2026年3月',
    position: { x: -40, y: 20, z: -30 },
  },
  {
    id: 'xuanwu-walk',
    modelPath: '/assets/models/xuanwu-walk.glb',
    titleZh: '玄武湖·晨间漫步',
    titleEn: 'Xuanwu Lake · Morning Walk',
    city: '南京',
    category: '公园',
    date: '2026年4月',
    position: { x: 40, y: -10, z: -20 },
  },
  {
    id: 'volunteer-lake',
    modelPath: '/assets/models/volunteer-lake.glb',
    titleZh: '志愿者·湖边相伴',
    titleEn: 'Volunteer · Lakeside Companion',
    city: '南京',
    category: '故事',
    date: '2026年5月',
    position: { x: 0, y: 30, z: 20 },
  },
  {
    id: 'warm-company',
    modelPath: '/assets/models/warm-company.glb',
    titleZh: '温暖·同行记',
    titleEn: 'Warm Companionship',
    city: '南京',
    category: '故事',
    date: '2026年6月',
    position: { x: -35, y: -20, z: 10 },
  },
  {
    id: 'company-photo',
    modelPath: '/assets/models/company-photo.glb',
    titleZh: '陪伴·镜头瞬间',
    titleEn: 'Companion · Captured Moment',
    city: '南京',
    category: '故事',
    date: '2026年7月',
    position: { x: 35, y: 15, z: 30 },
  },
  {
    id: 'corner-tower',
    modelPath: '/assets/models/corner-tower-keychain.glb',
    titleZh: '角楼·城市印记',
    titleEn: 'Corner Tower · City Mark',
    city: '南京',
    category: '建筑',
    date: '2026年8月',
    position: { x: 0, y: -25, z: -40 },
  },
];

export async function initArchiveScene(canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  camera.position.set(0, 30, 120);
  camera.lookAt(0, 0, 0);
  
  // Lighting setup
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(50, 80, 40);
  directionalLight.castShadow = true;
  directionalLight.shadow.camera.left = -100;
  directionalLight.shadow.camera.right = 100;
  directionalLight.shadow.camera.top = 100;
  directionalLight.shadow.camera.bottom = -100;
  scene.add(directionalLight);
  
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
  fillLight.position.set(-40, 20, -30);
  scene.add(fillLight);
  
  // Load models
  const { GLTFLoader } = await import('/three.bundle.js');
  const loader = new GLTFLoader();
  const loadedItems = [];
  
  for (const item of ARCHIVE_ITEMS) {
    try {
      const gltf = await new Promise((resolve, reject) => {
        loader.load(item.modelPath, resolve, undefined, reject);
      });
      
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      
      model.position.sub(center);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 15 / maxDim;
      model.scale.multiplyScalar(scale);
      
      const group = new THREE.Group();
      group.add(model);
      group.position.set(item.position.x, item.position.y, item.position.z);
      group.userData = item;
      
      // Add subtle glow
      const glowGeometry = new THREE.SphereGeometry(8, 16, 16);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.1,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      group.add(glow);
      
      scene.add(group);
      loadedItems.push(group);
    } catch (error) {
      console.warn(`Could not load ${item.id}:`, error);
    }
  }
  
  return { scene, camera, renderer, loadedItems };
}

// Orbit controls with mouse/touch
export function createOrbitControls(canvas, camera) {
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let cameraRotation = { x: 0, y: 0 };
  let cameraDistance = 120;
  let autoRotate = false;
  let autoRotateSpeed = 0.002;
  
  function updateCamera() {
    const x = cameraDistance * Math.sin(cameraRotation.y) * Math.cos(cameraRotation.x);
    const y = cameraDistance * Math.sin(cameraRotation.x);
    const z = cameraDistance * Math.cos(cameraRotation.y) * Math.cos(cameraRotation.x);
    
    camera.position.set(x, y + 30, z);
    camera.lookAt(0, 0, 0);
  }
  
  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });
  
  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;
    
    cameraRotation.y += deltaX * 0.005;
    cameraRotation.x -= deltaY * 0.005;
    cameraRotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, cameraRotation.x));
    
    updateCamera();
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });
  
  canvas.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraDistance += e.deltaY * 0.05;
    cameraDistance = Math.max(60, Math.min(200, cameraDistance));
    updateCamera();
  });
  
  // Touch support
  let touchStartDistance = 0;
  
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDistance = Math.sqrt(dx * dx + dy * dy);
    }
  });
  
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
      const deltaX = e.touches[0].clientX - previousMousePosition.x;
      const deltaY = e.touches[0].clientY - previousMousePosition.y;
      
      cameraRotation.y += deltaX * 0.005;
      cameraRotation.x -= deltaY * 0.005;
      cameraRotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, cameraRotation.x));
      
      updateCamera();
      previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const delta = touchStartDistance - distance;
      
      cameraDistance += delta * 0.1;
      cameraDistance = Math.max(60, Math.min(200, cameraDistance));
      updateCamera();
      touchStartDistance = distance;
    }
  });
  
  canvas.addEventListener('touchend', () => {
    isDragging = false;
  });
  
  function animate() {
    if (autoRotate) {
      cameraRotation.y += autoRotateSpeed;
      updateCamera();
    }
  }
  
  return {
    animate,
    reset: () => {
      cameraRotation = { x: 0, y: 0 };
      cameraDistance = 120;
      updateCamera();
    },
    toggleAutoRotate: () => {
      autoRotate = !autoRotate;
      return autoRotate;
    },
  };
}

// Raycaster for clicking models
export function createRaycaster(canvas, camera, items) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  
  function onClick(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(items, true);
    
    if (intersects.length > 0) {
      let object = intersects[0].object;
      while (object.parent && !object.userData.id) {
        object = object.parent;
      }
      return object.userData;
    }
    return null;
  }
  
  return { onClick };
}
