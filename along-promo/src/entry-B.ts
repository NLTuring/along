// Entry for scene owner B: registers Range-B and Shot-<id> (absolute film frames).
import { registerRoot } from 'remotion';
import { makeRoot } from './lib/makeRoot';
import { S00 } from './scenes/S00';
import { S01 } from './scenes/S01';
import { S02 } from './scenes/S02';

const { Root } = makeRoot('B', { S00, S01, S02 }, ['S00', 'S01', 'S02']);
registerRoot(Root);
