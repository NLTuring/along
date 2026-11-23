// Entry for scene owner C1: registers Range-C1 and Shot-<id> (absolute film frames).
import { registerRoot } from 'remotion';
import { makeRoot } from './lib/makeRoot';
import { S03 } from './scenes/S03';
import { S04 } from './scenes/S04';
import { S05 } from './scenes/S05';

const { Root } = makeRoot('C1', { S03, S04, S05 }, ['S03', 'S04', 'S05']);
registerRoot(Root);
