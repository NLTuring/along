// Run from any directory: node mobile/tools/build-3d.mjs
// Root dev dependencies (exact): three@0.170.0, esbuild@0.28.2. No CDN/devserver.
// Also bundles the clay engine ported from 捏个 PINCH (mobile/pinch/*.ts) into js/vendor/clay.js.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL('../assets/js/vendor/', import.meta.url));
const require = createRequire(import.meta.url);
await mkdir(output, { recursive: true });
const shared = { bundle: true, minify: true, format: 'esm', target: ['es2020'], platform: 'browser', legalComments: 'inline' };
await build({
  ...shared,
  stdin: { contents: "export { Scene, PerspectiveCamera, WebGLRenderer, Group, AmbientLight, DirectionalLight, HemisphereLight, BufferGeometry, BufferAttribute, Mesh, MeshStandardMaterial, MeshBasicMaterial, CanvasTexture, SRGBColorSpace, Color, Vector2, Vector3, Raycaster, RingGeometry, CircleGeometry, DoubleSide } from 'three';", resolveDir: root, sourcefile: 'along-three-entry.js' },
  outfile: path.join(output, 'three.js'),
});
await build({
  ...shared,
  entryPoints: [fileURLToPath(new URL('../pinch/along-clay.ts', import.meta.url))],
  banner: { js: '// Clay engine from 捏个 PINCH (team-owned source, mobile/pinch). Built by mobile/tools/build-3d.mjs.' },
  outfile: path.join(output, 'clay.js'),
});
await copyFile(path.join(path.dirname(require.resolve('three')), '..', 'LICENSE'), path.join(output, 'three.LICENSE.txt'));
console.log('Built local Three.js and clay engine ES modules. No network dependencies at runtime.');
