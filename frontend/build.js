// Bundle src/app.js (the arcade UI, rps-plugin.js and every
// duel-game-core/@icp-sdk module) into dist/app.js, then copy the static
// assets and the self-hosted pixel font, and write the SEO files (link
// preview card, icons, manifest, robots.txt, sitemap). dist/ is what goes
// online.
//
// SITE_URL is the page's public address, by default the live canister's
// (override with e.g. SITE_URL=https://<canister-id>.icp.net npm run build;
// SITE_URL= leaves it out). It fills the canonical link, Open Graph URLs
// and the sitemap; without it those are left out, since they must be
// absolute.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { renderIcon, renderOgImage } from './og-image.js';

const watch = process.argv.includes('--watch');
const outdir = 'dist';
const SITE_URL = 'https://uv7c2-yiaaa-aaaak-qzk2a-cai.icp.net';
const siteUrl = (process.env.SITE_URL ?? SITE_URL).replace(/\/+$/, '');

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
  ['src/style.css', `${outdir}/style.css`],
  ['src/favicon.svg', `${outdir}/favicon.svg`],
  [
    'node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2',
    `${outdir}/press-start-2p.woff2`,
  ],
]) {
  cpSync(from, to, { recursive: true });
}

// ── SEO ──────────────────────────────────────────────────────────────────

const title = 'RPS Arcade – Play Rock Paper Scissors Online, Free 2-Player';
const description =
  'Play Rock Paper Scissors online against real people or the CPU. Free, no sign-up, ' +
  'retro arcade style with an ELO leaderboard.';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': ['VideoGame', 'WebApplication'],
  name: 'RPS Arcade',
  alternateName: 'Rock Paper Scissors Arcade',
  description,
  ...(siteUrl && { url: `${siteUrl}/`, image: `${siteUrl}/og-image.png` }),
  genre: ['Arcade', 'Hand game', 'Party game'],
  gamePlatform: 'Web browser',
  applicationCategory: 'GameApplication',
  operatingSystem: 'Any',
  playMode: ['MultiPlayer', 'SinglePlayer'],
  numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 2 },
  inLanguage: 'en',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

let html = readFileSync('src/index.html', 'utf8')
  .replaceAll('%TITLE%', title)
  .replaceAll('%DESCRIPTION%', description)
  .replace('<!-- seo:jsonld -->', `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);
html = siteUrl
  ? html.replaceAll('%SITE_URL%', siteUrl).replace(/[ \t]*<!-- \/?seo:absolute -->\n/g, '')
  : html.replace(/[ \t]*<!-- seo:absolute -->[\s\S]*?<!-- \/seo:absolute -->\n/, '');
writeFileSync(`${outdir}/index.html`, html);

writeFileSync(`${outdir}/og-image.png`, renderOgImage());
for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  writeFileSync(`${outdir}/${file}`, renderIcon('src/favicon.svg', size));
}

writeFileSync(
  `${outdir}/site.webmanifest`,
  JSON.stringify(
    {
      name: 'RPS Arcade',
      short_name: 'RPS Arcade',
      description,
      start_url: './',
      display: 'standalone',
      background_color: '#0b0410',
      theme_color: '#0b0410',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2,
  ) + '\n',
);

writeFileSync(
  `${outdir}/robots.txt`,
  `User-agent: *\nAllow: /\n${siteUrl ? `\nSitemap: ${siteUrl}/sitemap.xml\n` : ''}`,
);
if (siteUrl) {
  writeFileSync(
    `${outdir}/sitemap.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>
  </url>
</urlset>
`,
  );
} else {
  console.warn('SITE_URL not set: no canonical link, og:url/og:image or sitemap.xml in dist/.');
}
