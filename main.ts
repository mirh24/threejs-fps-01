// DUSTLINE — the threejs-fps-01 entrypoint.
//
// This program hands the game in. It runs on Node 22 with only the standard
// library: it copies the static game (game/) and the screenshots (screenshots/)
// from beside this file into the output directory, then writes dossier.json,
// the summary the judge reads, using the vendored make.fun library.
//
// Inside the grader the output directory is /output. Anywhere else, set
// MAKEFUN_OUTPUT_DIR to point at a directory of your own, e.g.:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// The directory this file lives in — the repository root.
const root = fileURLToPath(new URL('.', import.meta.url));

// Where the finished entry goes. The grader gives us /output; a local run
// overrides it through the environment. The build is deterministic: the same
// repository always writes the same dossier bytes, so the grader's two runs
// agree with each other and with the one you run here.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps. Only text_max_bytes changes the dossier's bytes; the
// rest refuse an entry the scorer would refuse anyway (too many screenshots,
// a screenshot over 256 KiB, too many game files, a game over 48 MiB — and the
// game counts beside /output's own 1,000-entry cap, which it shares with
// screenshots/ and dossier.json).
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

mkdirSync(outDir, { recursive: true });

// The whole game, verbatim: every static file the browser loads.
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });

// The screenshots, when the repository has any. A repository without them
// still builds a dossier; the gate is what refuses it.
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, caps));
