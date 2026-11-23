// Entry for scene owner C2: registers Range-C2 and Shot-<id> (absolute film frames).
import { registerRoot } from 'remotion';
import { makeRoot } from './lib/makeRoot';
import { S06 } from './scenes/S06';
import { S07 } from './scenes/S07';

const { Root } = makeRoot('C2', { S06, S07 }, ['S06', 'S07']);
registerRoot(Root);
