// DUSTLINE — make.fun threejs-fps-01 entrypoint.
//
// Copies game/ and screenshots/ from this repository into the output
// directory and writes dossier.json there with buildDossier from the
// vendored library. Runs on Node 22, standard library only, no network.
// The output directory is /output in the grader, or MAKEFUN_OUTPUT_DIR
// outside it. Running it twice over the same repository writes the same
// bytes both times.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// The repository root is the directory holding this file.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy one tree (game/ or screenshots/) into the output directory,
// visiting entries in sorted order so the copy is deterministic.
function copyTree(name: string): void {
  const source = join(repoRoot, name);
  const target = join(outputDir, name);
  const stack: Array<[string, string]> = [[source, target]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    mkdirSync(to, { recursive: true });
    const entries = readdirSync(from, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const fromPath = join(from, entry.name);
      const toPath = join(to, entry.name);
      if (entry.isDirectory()) {
        stack.push([fromPath, toPath]);
      } else if (entry.isFile()) {
        copyFileSync(fromPath, toPath);
      }
    }
  }
}

function main(): void {
  mkdirSync(outputDir, { recursive: true });
  // Start from a clean output directory so stale files never leak in.
  for (const name of ['game', 'screenshots']) {
    const target = join(outputDir, name);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  }
  if (existsSync(join(outputDir, 'dossier.json'))) rmSync(join(outputDir, 'dossier.json'), { force: true });
  copyTree('game');
  copyTree('screenshots');
  const dossier = buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
  const gameFiles = readdirSync(join(outputDir, 'game'), { recursive: true }).length;
  console.log(`DUSTLINE: wrote ${outputDir}/dossier.json (${dossier.length} bytes, ${gameFiles} game entries)`);
}

main();
