// 小游 in 3D, as on the website (website/assets/js/buddy.js): the Blender model models/xiaoyou.glb,
// cel-shaded with buddy.js's 4-step toon ramp; small parts drawn flat (FLAT) and without outline
// (NO_LINE); an inked outline = back faces pushed out along the normals by .011. Parts driven by
// the pose: Eyes / EyesHappy / MouthO / MouthGrin / ArmR / ArmL / Tails / Hat. Every value comes
// from the frame (no clock, no Math.random). Placed by film coordinates: feet (x, y) and height h.
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const INK = new THREE.Color('#1B1813');
const FLAT = /^(Eye|Shine|Happy|Blush|Tongue|Mouth|BagSeam)/;
const NO_LINE = /^(Eye|Shine|Happy|Blush|Tongue|Mouth|BagSeam|BagBuckle|Band|BrimEdge|Knot)/;

function toonRamp() {
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 238, 238, 238, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
function outlineMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * .011;');
  };
  return m;
}

export type XyPose = {
  x: number; y: number; h: number; // feet on film px; height (shoes → hat) in film px
  yaw: number; // radians, relative to facing the camera (spin included)
  lean: number; // radians, the apparent forward tilt wanted (shows the top of the hat)
  sx: number; sy: number; // squash & stretch about the feet
  armR: number; armL: number; tails: number; hat: number; // part rotations (buddy.js axes)
  eyes: 'open' | 'happy'; mouth: 'grin' | 'o'; blink: number; look: number;
  visible: boolean;
};

const FOV = 28;
export const FOCAL = 540 / Math.tan(((FOV / 2) * Math.PI) / 180); // film px per unit at distance 1
const CAM = { y: 0.9, z: 14 };

type Rig = { root: THREE.Group; tilt: THREE.Group; parts: Record<string, THREE.Object3D>; height: number; base: { hatZ: number; eyesY: number; happyY: number } };

let MODEL: Promise<THREE.Group> | null = null;
const loadModel = () => (MODEL ??= new GLTFLoader().loadAsync(staticFile('models/xiaoyou.glb')).then((g) => g.scene));

function buildRig(src: THREE.Group): Rig {
  const model = src;
  const parts: Record<string, THREE.Object3D> = {};
  const meshes: THREE.Mesh[] = [];
  model.traverse((o) => { if (o.name) parts[o.name] = o; if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const box = new THREE.Box3().setFromObject(model);
  const ramp = toonRamp(), outline = outlineMaterial();
  for (const o of meshes) {
    const srcMat = o.material as THREE.MeshStandardMaterial;
    const color = srcMat.color.clone();
    o.material = FLAT.test(o.name) ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshToonMaterial({ color, gradientMap: ramp });
    srcMat.dispose();
    if (!NO_LINE.test(o.name)) { const line = new THREE.Mesh(o.geometry, outline); line.name = ''; o.add(line); }
  }
  model.position.y = -box.min.y; // feet on the pivot
  const tilt = new THREE.Group();
  tilt.add(model);
  const root = new THREE.Group();
  root.add(tilt);
  return {
    root, tilt, parts, height: box.max.y - box.min.y,
    base: { hatZ: parts.Hat?.rotation.z ?? 0, eyesY: parts.Eyes?.position.y ?? 0, happyY: parts.EyesHappy?.position.y ?? 0 },
  };
}

const Scene: React.FC<{ rig: Rig; pose: XyPose; onReady: () => void }> = ({ rig, pose, onReady }) => {
  const { camera, advance } = useThree();
  const apply = () => {
    const p = pose, P = rig.parts;
    camera.position.set(0, CAM.y, CAM.z);
    camera.lookAt(0, CAM.y, 0);
    const d = (rig.height * FOCAL) / Math.max(1, p.h); // distance from the camera
    const X = ((p.x - 960) * d) / FOCAL, Y = CAM.y - ((p.y - 540) * d) / FOCAL, Z = CAM.z - d;
    rig.root.position.set(X, Y, Z);
    rig.root.visible = p.visible;
    // Face the camera wherever he stands, then the pose's own yaw; lean so the hat top shows a little
    // whether he is high or low in the frame.
    const elev = Math.atan((p.y - p.h / 2 - 540) / FOCAL);
    const lean = Math.min(0.32, Math.max(0.06, p.lean - elev));
    rig.root.rotation.set(0, Math.atan2(-X, CAM.z - Z) + p.yaw, 0);
    rig.tilt.rotation.set(lean, 0, 0);
    rig.tilt.scale.set(p.sx, p.sy, p.sx);
    if (P.ArmR) P.ArmR.rotation.z = p.armR;
    if (P.ArmL) P.ArmL.rotation.z = p.armL;
    if (P.Tails) P.Tails.rotation.x = p.tails;
    if (P.Hat) P.Hat.rotation.z = rig.base.hatZ + p.hat;
    if (P.Eyes) { P.Eyes.visible = p.eyes === 'open'; P.Eyes.scale.y = p.blink; P.Eyes.position.x = p.look * 0.03; P.Eyes.position.y = rig.base.eyesY; }
    if (P.EyesHappy) { P.EyesHappy.visible = p.eyes === 'happy'; P.EyesHappy.position.x = p.look * 0.03; P.EyesHappy.position.y = rig.base.happyY; }
    if (P.MouthGrin) P.MouthGrin.visible = p.mouth === 'grin';
    if (P.MouthO) P.MouthO.visible = p.mouth === 'o';
  };
  useLayoutEffect(apply);
  useFrame(apply);
  useEffect(() => { apply(); advance(performance.now()); onReady(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <hemisphereLight args={['#FFFFFF', '#B9C8CC', 1.6]} />
      <directionalLight color="#FFF4E2" intensity={2.6} position={[-2, 4, 5]} />
      <primitive object={rig.root} />
    </>
  );
};

export const Xiaoyou3D: React.FC<{ pose: XyPose }> = ({ pose }) => {
  const [handle] = useState(() => delayRender('xiaoyou.glb'));
  const [rig, setRig] = useState<Rig | null>(null);
  useEffect(() => {
    loadModel().then((g) => setRig(buildRig(g))).catch((e) => { console.error('xiaoyou.glb', e); continueRender(handle); });
  }, [handle]);
  return (
    <ThreeCanvas width={1920} height={1080} flat camera={{ fov: FOV, near: 0.1, far: 80, position: [0, CAM.y, CAM.z] }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }} style={{ position: 'absolute', left: 0, top: 0 }}>
      {rig && <Scene rig={rig} pose={pose} onReady={() => continueRender(handle)} />}
    </ThreeCanvas>
  );
};
