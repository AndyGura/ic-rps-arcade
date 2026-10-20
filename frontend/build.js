// Bundle src/app.js (the arcade UI, rps-plugin.js and every
// duel-game-core/@icp-sdk module) into dist/app.js, then copy the static
// assets and the self-hosted pixel font. dist/ is what goes online.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const buildOptions = {
  entryPoints: ['src/app.js'],
  bundle: true,
  outfile: `${outdir}/app.js`,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('watching for changes...');
} else {
  await esbuild.build(buildOptions);
}

for (const [from, to] of [
  ['src/index.html', `${outdir}/index.html`],
  ['src/style.css', `${outdir}/style.css`],
  ['src/favicon.svg', `${outdir}/favicon.svg`],
  [
    'node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2',
    `${outdir}/press-start-2p.woff2`,
  ],
]) {
  cpSync(from, to, { recursive: true });
}
