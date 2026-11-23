// Run from any directory: node mobile/tools/build-3d.mjs
// Root dev dependencies (exact): three@0.170.0, esbuild@0.28.2. No CDN/devserver.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL('../assets/js/vendor/', import.meta.url));
const require = createRequire(import.meta.url);
await mkdir(output, { recursive: true });
await build({
  stdin: { contents: "export { Scene, PerspectiveCamera, WebGLRenderer, Group, AmbientLight, DirectionalLight, BufferGeometry, BufferAttribute, Mesh, MeshStandardMaterial, CanvasTexture, SRGBColorSpace, Color } from 'three';", resolveDir: root, sourcefile: 'along-three-entry.js' },
  bundle: true, minify: true, format: 'esm', target: ['es2020'], platform: 'browser', legalComments: 'inline',
  outfile: path.join(output, 'three.js'),
});
await copyFile(path.join(path.dirname(require.resolve('three')), '..', 'LICENSE'), path.join(output, 'three.LICENSE.txt'));
console.log('Built local Three.js ES module and license. No network dependencies at runtime.');
