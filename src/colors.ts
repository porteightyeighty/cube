import type { Face } from './model/cube';

/** Standard Western scheme: white up, green front, red right. */
export const COLOR_NAME: Record<Face, string> = {
  U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue',
};
export const COLOR_HEX: Record<string, string> = {
  U: '#f4f4ef', R: '#d5202f', F: '#10a556', D: '#ffd60a', L: '#ff7a1a', B: '#1c5fd6', X: '#4b5160',
};
