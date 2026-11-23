// Load the film's fonts once per page before any frame is captured.
import { continueRender, delayRender, staticFile } from 'remotion';

const FACES: [string, string, string][] = [
  ['Along Serif', 'fonts/NotoSerifSC-sub.woff2', '200 900'],
  ['Along Sans', 'fonts/NotoSansSC-sub.woff2', '100 900'],
  ['Source Serif 4', 'fonts/source-serif-4-latin.woff2', '400 700'],
];

const handle = delayRender('fonts');
Promise.all(
  FACES.map(([family, file, weight]) => {
    const face = new FontFace(family, `url(${staticFile(file)}) format('woff2')`, { weight });
    return face.load().then((f) => {
      document.fonts.add(f);
    });
  }),
)
  .then(() => continueRender(handle))
  .catch((e) => {
    console.error('font load failed', e);
    continueRender(handle);
  });

export {};
