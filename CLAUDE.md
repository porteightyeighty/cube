# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Browser-only Rubik's cube solver: the user enters a cube (camera scan or painting stickers), it's validated, solved off-thread with `cubejs` (Kociemba two-phase), and the solution is stepped through on a Three.js cube. Vanilla TypeScript + Vite, no UI framework.

## Commands

- `npm run dev` — Vite dev server (`--host`, so it's reachable from a phone on the LAN; camera access needs https or localhost)
- `npm run build` — `tsc --noEmit` type check, then `vite build` into `dist/`. This is the only type-check/lint step.
- `npm test` — Vitest, all tests once
- Single file / single test: `npx vitest run tests/model.test.ts`, `npx vitest run -t "solves 20"`
- `npm start` — serves `dist/` with `serve` on `$PORT` (default 3000), for deployment

tsconfig has `noUnusedLocals`/`noUnusedParameters` on, so unused code fails the build.

## Architecture

**The 54-char facelet string is the single source of truth.** Kociemba order (U, R, F, D, L, B; each face row-major), each letter names the face whose centre colour the sticker has; `X` = blank. Everything else (3D view, net, validation, solver input) is derived from it. In `src/main.ts`, `state` is module-level; any change goes through `turn()` (records undo history, animates) or `replaceState()` (new position: drops solution + history), then `refresh()` re-renders every view and persists to `localStorage`.

**Geometry drives everything** (`src/model/cube.ts`). `GEOM[i]` gives each facelet's cubie position (each coord in {-1,0,1}) and outward normal. Move permutation tables are *derived* by rotating that geometry (`rotQ`), not hand-written, and the 3D view (`view/cubies.ts`, `view/animator.ts`) and drag-to-turn (`view/interaction.ts`) use the same `GEOM`/`FACE_AXIS`. Change the facelet layout in one place and everything follows. Moves are `{face, turns: 1|2|3}` (3 = prime).

**Validation** (`src/model/validate.ts`) reads corners/edges via the `CORNERS`/`EDGES` facelet index tables, and reports user-facing errors (blank stickers, wrong centres, colour counts, impossible or duplicate pieces, twist, flip, permutation parity) with facelets to highlight. When a full cube is invalid it also tries every single-face sticker rotation, suggesting `fixes` — the common "face scanned rotated" mistake.

**Solver** (`src/solver/`): `cubejs` is plain browser scripts that attach `Cube` to `this`, so `solver.worker.ts` imports the sources with `?raw` and runs them through `new Function(...).call(scope)`. `initSolver()` takes several seconds, which is why it runs in a module Web Worker. `SolverClient` matches request ids to replies and checks every returned solution by applying it to the state before trusting it. `src/cubejs.d.ts` holds the hand-written types. Tests import `cubejs` directly in Node instead of going through the worker.

**3D view** (`src/view/`): the 26 cubies always sit in their home slots; colours come from the state string. `Animator` animates a turn by reparenting one layer's cubies onto a pivot group, then at the end snaps them home and recolours from the new state. It speeds up when moves queue up. `shown` is what's painted, and may lag behind `state` mid-animation.

**Scanning** (`src/scan/`): `flow.ts` is the camera UI state machine. Faces are captured in `SCAN_ORDER` (F R B L U D), with a required top face for each (`TOP`) so rows land in facelet order. `detect.ts` is pure, DOM-free colour logic (tested with simulated lighting/noise in `tests/detect.test.ts`). It uses a lightness-normalised Lab distance (`colorDist`, to keep red and orange apart under uneven light), calibrates against each scanned face's own centre, and `classifyBalanced` greedily assigns colours so there are exactly 9 of each, keeping cells the user fixed by hand.

**UI** (`src/ui/`): small DOM classes (net map, palette, solution stepper, move pad and key bindings) wired by callbacks in `main.ts`. Colour scheme (white U, green F, red R) lives in `src/colors.ts`.

In dev builds, `window.cube` exposes `state`, `set`, `turn`, `solve`, `gotoStep` for console debugging.
