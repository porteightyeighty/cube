/// <reference lib="webworker" />
import type CubeClass from 'cubejs';
import cubeSrc from 'cubejs/lib/cube.js?raw';
import solveSrc from 'cubejs/lib/solve.js?raw';

// cubejs is written as plain browser scripts that hang `Cube` off `this`.
// Bundlers leave `this` undefined, so run the two files against our own scope.
const scope: { Cube?: typeof CubeClass } = {};
new Function(cubeSrc).call(scope);
new Function(solveSrc).call(scope);
const Cube = scope.Cube!;

// Building the two-phase tables takes a few seconds; do it off the main thread.
Cube.initSolver();
postMessage({ type: 'ready' });

onmessage = (e: MessageEvent<{ id: number; facelets: string }>) => {
  const { id, facelets } = e.data;
  try {
    postMessage({ type: 'solution', id, alg: Cube.fromString(facelets).solve().trim() });
  } catch (err) {
    postMessage({ type: 'error', id, message: String(err) });
  }
};
