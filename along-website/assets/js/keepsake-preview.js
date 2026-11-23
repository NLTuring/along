// Keepsake 3D preview using three.js
import * as THREE from '/three.bundle.js';

export async function initKeepsakePreview(canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ 
    canvas, 
    antialias: true, 
    alpha: true 
  });
  
  renderer.setSize(200, 200);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  
  camera.position.set(0, 0, 80);
  
  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);
  
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
  fillLight.position.set(-5, -3, -5);
  scene.add(fillLight);
  
  // Load a sample keepsake model
  const { GLTFLoader } = await import('/three.bundle.js');
  const loader = new GLTFLoader();
  
  try {
    const gltf = await new Promise((resolve, reject) => {
      loader.load(
        '/assets/models/jiming-temple.glb',
        resolve,
        undefined,
        reject
      );
    });
    
    const model = gltf.scene;
    
    // Center and scale model
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    model.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 50 / maxDim;
    model.scale.multiplyScalar(scale);
    
    scene.add(model);
    
    // Gentle rotation animation
    let rotation = 0;
    function animate() {
      requestAnimationFrame(animate);
      rotation += 0.003;
      model.rotation.y = rotation;
      model.rotation.x = Math.sin(rotation * 0.5) * 0.1;
      renderer.render(scene, camera);
    }
    animate();
    
  } catch (error) {
    console.warn('Could not load keepsake model:', error);
    // Render a placeholder cube
    const geometry = new THREE.BoxGeometry(30, 30, 30);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xB24A2C,
      roughness: 0.5,
      metalness: 0.1
    });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
    
    function animate() {
      requestAnimationFrame(animate);
      cube.rotation.y += 0.005;
      cube.rotation.x += 0.002;
      renderer.render(scene, camera);
    }
    animate();
  }
  
  return { scene, camera, renderer };
}
