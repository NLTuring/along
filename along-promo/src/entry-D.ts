// Entry for scene owner D: registers Range-D and Shot-<id> (absolute film frames).
import { registerRoot } from 'remotion';
import { makeRoot } from './lib/makeRoot';
import { S08 } from './scenes/S08';
import { S09 } from './scenes/S09';
import { S10 } from './scenes/S10';
import { S11 } from './scenes/S11';

const { Root } = makeRoot('D', { S08, S09, S10, S11 }, ['S08', 'S09', 'S10', 'S11']);
registerRoot(Root);
