import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
// GPU (ANGLE/D3D11) for CSS 3D and three.js scenes.
Config.setChromiumOpenGlRenderer('angle');
// Use the already installed headless shell instead of downloading one.
Config.setBrowserExecutable('C:\\Users\\Sgh\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1248\\chrome-headless-shell-win64\\chrome-headless-shell.exe');
// Several agents render stills at once: no shared webpack cache.
Config.setCachingEnabled(false);
Config.setDelayRenderTimeoutInMilliseconds(120000);
