// Bundle three.js core and essential addons for the Along website
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const entryContent = `
export * from 'three';
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
export { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
export { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
`;

await build({
  stdin: {
    contents: entryContent,
    resolveDir: root,
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  outfile: join(root, 'public/three.bundle.js'),
  external: [],
});

console.log('✓ three.bundle.js built');
