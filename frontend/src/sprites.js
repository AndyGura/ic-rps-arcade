// 16×16 pixel-art sprites, drawn as crisp SVG rects. One character per
// pixel; "." is transparent. Rows shorter than 16 are padded.

const PALETTE = {
  k: "#12061c", // outline
  w: "#ffffff",
  W: "#d9d2ff", // paper shade
  g: "#b9b2cc", // stone
  G: "#7c7092", // stone shadow
  h: "#e7e2f2", // stone highlight
  c: "#25e3ff", // cyan
  C: "#1597c9",
  p: "#ff2bd6", // pink
  P: "#a3168a",
  y: "#ffd23f", // yellow
  o: "#ff8a3d", // orange
  b: "#8a4b2a", // wood
  B: "#5a2e19",
  r: "#ff3d5a",
};

const ART = {
  rock: [
    "................",
    "................",
    ".....kkkkkk.....",
    "...kkhhhgggkk...",
    "..khhhgggggggk..",
    ".khhgggggggggGk.",
    ".khggggggggggGk.",
    "kgggggggggGgggGk",
    "kggggggggGGgggGk",
    "kgGggggggggggGGk",
    "kgGGggggggggGGGk",
    "kGGgggggggggGGGk",
    ".kGGGggggGGGGGk.",
    "..kkGGGGGGGGkk..",
    "....kkkkkkkk....",
    "................",
  ],
  paper: [
    "................",
    "..kkkkkkkkk.....",
    "..kwwwwwwwkk....",
    "..kwwwwwwwkWk...",
    "..kwwwwwwwkkkk..",
    "..kwppppwwwwWk..",
    "..kwwwwwwwwwWk..",
    "..kwCCCCCCCwWk..",
    "..kwwwwwwwwwWk..",
    "..kwCCCCCCCwWk..",
    "..kwwwwwwwwwWk..",
    "..kwCCCCCwwwWk..",
    "..kwwwwwwwwwWk..",
    "..kWWWWWWWWWWk..",
    "..kkkkkkkkkkkk..",
    "................",
  ],
  scissors: [
    "................",
    ".kk..........kk.",
    ".kwk........kwk.",
    "..kwk......kwk..",
    "...kwk....kwk...",
    "....kwk..kwgk...",
    ".....kwkkwgk....",
    "......kwygk.....",
    "......kyyyk.....",
    ".....kpkkpk.....",
    "...kkpk..kpkk...",
    "..kpPk....kPpk..",
    ".kpk.pk..kp.kpk.",
    ".kpk.pk..kp.kpk.",
    "..kppk....kppk..",
    "...kk......kk...",
  ],
  well: [
    "................",
    "......kkkk......",
    "....kkppppkk....",
    "..kkppppppppkk..",
    ".kPPPPPPPPPPPPk.",
    "..kbkkkkkkkkbk..",
    "..kbk..kk..kbk..",
    "..kbk..kk..kbk..",
    "..kbk.kyyk.kbk..",
    ".kkkkkkkkkkkkkk.",
    ".khgGghgGghgGgk.",
    ".kgGgGgGgGgGgGk.",
    ".kGgCCCCCCCCgGk.",
    ".kgGgGgGgGgGgGk.",
    ".kkkkkkkkkkkkkk.",
    "................",
  ],
  mystery: [
    "kkkkkkkkkkkkkkkk",
    "kyyyyyyyyyyyyyyk",
    "kyoyyyyyyyyyyoyk",
    "kyyyyykkkkyyyyok",
    "kyyyykkookkyyyok",
    "kyyyykkoykkyyyok",
    "kyyyyyyyykkoyyok",
    "kyyyyyyykkooyyok",
    "kyyyyyykkooyyyok",
    "kyyyyyykkoyyyyok",
    "kyyyyyyooyyyyyok",
    "kyyyyyykkyyyyyok",
    "kyyyyyykkoyyyyok",
    "kyoyyyyyooyyyooK",
    "kyoooooooooooook",
    "kkkkkkkkkkkkkkkk",
  ],
  spark: [
    ".......y........",
    ".......y........",
    "...y...y...y....",
    "....y..w..y.....",
    ".....y.w.y......",
    "......www.......",
    "yyyywwwwwwwyyyy.",
    "......www.......",
    ".....y.w.y......",
    "....y..w..y.....",
    "...y...y...y....",
    ".......y........",
    ".......y........",
    "................",
    "................",
    "................",
  ],
};

const cache = new Map();

/// SVG markup for a sprite; horizontal runs of one colour merge into one rect.
export function sprite(name, cls = "") {
  const key = name + "|" + cls;
  if (cache.has(key)) return cache.get(key);
  const rows = ART[name] ?? ART.mystery;
  let rects = "";
  rows.forEach((row, y) => {
    const line = row.padEnd(16, ".").slice(0, 16);
    let x = 0;
    while (x < 16) {
      const ch = line[x];
      let run = 1;
      while (x + run < 16 && line[x + run] === ch) run++;
      const fill = PALETTE[ch] ?? (ch === "K" ? PALETTE.k : null);
      if (fill) rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${fill}"/>`;
      x += run;
    }
  });
  const svg = `<svg class="sprite ${cls}" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  cache.set(key, svg);
  return svg;
}
