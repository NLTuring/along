// Write 小游 as a standalone static SVG for the banner, straight from the app's own mascot module so the
// character matches the app exactly.   node tools/mascot.mjs [expression] [action] [armDeg]
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, '..', '..', 'mobile', 'assets');
const { mascotSvg } = await import(pathToFileURL(join(mobile, 'js', 'assistant-mascot.js')).href);
const [expression = 'happy', action = 'wave', armDeg = '-122'] = process.argv.slice(2);

// The shared <defs> block is only exported through ensureMascotDefs(document); lift it from the module source.
const src = readFileSync(join(mobile, 'js', 'assistant-mascot.js'), 'utf8');
const defs = src.match(/const DEFS = `<svg[^>]*>(<defs>[\s\S]*?<\/defs>)/)[1];

// Static subset of assistant.css: which parts show for this expression/action, and the arm pose (no animation).
const css = `
svg.xy :is(.p-all,.p-body,.p-armL,.p-armR,.p-head,.p-shadow,.p-tail,.eyes,.mouth,.pr-pin,.pr-spark g,.pr-heart g){transform-box:fill-box}
svg.xy .p-all,svg.xy .p-body{transform-origin:50% 100%}
svg.xy .p-armL{transform-origin:85% 18%}
svg.xy .p-armR{transform-origin:15% 18%}
svg.xy .p-head{transform-origin:50% 92%}
svg.xy .p-tail{transform-origin:20% 0%}
svg.xy .eye,svg.xy .mouth,svg.xy .brow,svg.xy .prop{display:none}
svg.xy[data-e=normal] .e-normal,svg.xy[data-e=happy] .e-happy,svg.xy[data-e=wink] .e-wink,svg.xy[data-e=excited] .e-star,svg.xy[data-e=proud] .e-happy{display:inline}
svg.xy[data-e=normal] .m-smile,svg.xy[data-e=happy] .m-grin,svg.xy[data-e=wink] .m-smile,svg.xy[data-e=excited] .m-grin,svg.xy[data-e=proud] .m-smirk{display:inline}
svg.xy[data-e=proud] .b-proud{display:inline}
svg.xy[data-a=guide] .pr-pin,svg.xy[data-a=cheer] .pr-spark,svg.xy[data-e=excited] .pr-spark{display:inline}
svg.xy[data-a=guide] .p-armR{transform:rotate(-96deg)}
svg.xy[data-a=wave] .p-armR{transform:rotate(${Number(armDeg)}deg)}
svg.xy .p-shadow{display:none}`;

const svg = mascotSvg({ expression, action, live: false })
  .replace('<svg class="xy"', `<svg xmlns="http://www.w3.org/2000/svg" class="xy"`)
  .replace(/ aria-hidden="true" focusable="false">/, `><style>${css}</style>${defs}`);
writeFileSync(join(here, '..', 'assets', 'xiaoyou.svg'), svg);
console.log('xiaoyou.svg', expression, action, armDeg, svg.length, 'bytes');
