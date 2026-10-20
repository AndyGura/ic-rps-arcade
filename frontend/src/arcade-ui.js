// The arcade UI: every screen, the fight arena with its READY?/FIGHT!
// reveal, the HUD, dialogs and local clocks, over duel-game-core's
// headless client (createDuelClient). Nothing here talks to the backend
// directly; every control calls one client method.

import {
  atTableOf,
  claimRoleOf,
  localSecondsElapsed,
  localSecondsLeft,
  tag,
  withLocalMove,
} from "@research-ag/duel-game-core/client.js";
import {
  claimWarningThreshold,
  esc,
  idleWarningThreshold,
  playerKeyOf,
} from "@research-ag/duel-game-core/render.js";
import {
  MOVES,
  SEAT_NAME,
  SEAT_SHORT,
  VARIANT_LABEL,
  moveOf,
  plugin,
  roundWinner,
  scoreOf,
  variantOf,
} from "./rps-plugin.js";
import { sprite } from "./sprites.js";
import * as sfx from "./sfx.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const other = (seat) => (seat === "p1" ? "p2" : "p1");
const pad = (n, w) => String(n).padStart(w, "0");
const shortId = (s) => (s.length > 11 ? s.slice(0, 5) + "…" + s.slice(-3) : s);

/// Pixel text with the chromatic two-tone drop shadow of the title art.
const chroma = (text, cls = "") => `<span class="chroma ${cls}" data-text="${esc(text)}">${esc(text)}</span>`;

// ── Screens other than the arena ─────────────────────────────────────────

function logo() {
  return `
    <div class="logo">
      <div class="logo-line l1">${chroma("ROCK")}</div>
      <div class="logo-line l2">${chroma("PAPER")}</div>
      <div class="logo-line l3">${chroma("SCISSORS")}</div>
    </div>`;
}

function seatCell(r, seat) {
  const open = seat === "p1" ? r.p1Open : r.p2Open;
  const occ = seat === "p1" ? r.p1Session : r.p2Session;
  if (open) {
    return `<button class="btn btn-join" data-op="join" data-table="${r.id}" data-seat="${seat}" data-key="jointable:${r.id}:${seat}"${r.protected ? " data-protected" : ""}>JOIN ${SEAT_SHORT[seat]}</button>`;
  }
  const who = occ.length === 1 ? occ[0] : "";
  return `<span class="occupant" title="${esc(who)}">${SEAT_SHORT[seat]} ${who ? esc(shortId(playerKeyOf(who))) : "---"}</span>`;
}

function tableRow(r) {
  const full = !r.p1Open && !r.p2Open;
  return `
    <li class="table-row${full ? " full" : ""}">
      <span class="t-id">#${pad(r.id, 3)}</span>
      <span class="t-mode">${esc(plugin.formatOptions(r.options))}</span>
      <span class="t-lock">${r.protected ? `<span class="lock" title="Access code">🔒</span>` : `<span class="open-tag">OPEN</span>`}</span>
      <span class="t-seat">${seatCell(r, "p1")}</span>
      <span class="t-seat">${seatCell(r, "p2")}</span>
      <span class="t-wait" data-clock="wait" data-base="${r.waitingSecs}">${full ? "IN GAME" : ""}</span>
    </li>`;
}

function tableList(tables) {
  if (tables.length === 0) {
    return `<p class="empty blink-slow">NO TABLES YET · START ONE ABOVE</p>`;
  }
  return `<ul class="tables">${tables.map(tableRow).join("")}</ul>`;
}

function browsingSkeleton(hi) {
  return `
    <div class="title-screen">
      ${logo()}
      <div class="hi-line"><span class="hi-label">HI</span> <span class="hi-score" data-hi>${hi}</span></div>
      <div class="panels">
        <section class="panel new-game">
          <h2 class="panel-title">NEW GAME</h2>
          <div class="field">
            <span class="field-label">SEAT</span>
            <div class="seg">
              <label><input type="radio" name="ng-seat" value="p1" checked /><span>1P</span></label>
              <label><input type="radio" name="ng-seat" value="p2" /><span>2P</span></label>
            </div>
          </div>
          <div class="field">
            <span class="field-label">MODE</span>
            <div class="seg">
              <label><input type="radio" name="ng-variant" value="classic" checked /><span>CLASSIC</span></label>
              <label><input type="radio" name="ng-variant" value="well" /><span>+WELL</span></label>
            </div>
          </div>
          <div class="field">
            <span class="field-label">FIRST TO</span>
            <div class="stepper">
              <button class="btn btn-step" data-op="wins-down" aria-label="Fewer wins">◀</button>
              <output id="ng-wins">3</output>
              <button class="btn btn-step" data-op="wins-up" aria-label="More wins">▶</button>
            </div>
          </div>
          <div class="field">
            <span class="field-label">ACCESS</span>
            <div class="seg">
              <label><input type="radio" name="ng-vis" value="open" checked /><span>OPEN</span></label>
              <label><input type="radio" name="ng-vis" value="code" /><span>CODE</span></label>
            </div>
          </div>
          <div class="field code-field" hidden>
            <span class="field-label">CODE</span>
            <input id="ng-code" type="text" maxlength="16" autocomplete="off" spellcheck="false" placeholder="SECRET" />
          </div>
          <div class="start-row">
            <button class="btn btn-primary btn-big" data-op="create" data-key="create:p1">START ▶</button>
          </div>
          <div class="cpu-row" id="cpu-row"></div>
        </section>
        <section class="panel tables-panel">
          <h2 class="panel-title">ARCADE FLOOR</h2>
          <div id="table-list"></div>
        </section>
      </div>
    </div>`;
}

function tableLobby(id, v) {
  const seatBtn = (seat, open) =>
    open
      ? `<button class="btn btn-primary" data-op="join" data-table="${id}" data-seat="${seat}" data-key="jointable:${id}:${seat}">JOIN AS ${SEAT_SHORT[seat]}</button>`
      : `<span class="occupant">${SEAT_SHORT[seat]} TAKEN</span>`;
  return `
    <div class="message-screen">
      <h1 class="big-title">${chroma(`TABLE #${pad(id, 3)}`)}</h1>
      <p>A SEAT IS FREE. TAKE IT?</p>
      <div class="row">${seatBtn("p1", v.p1Open)}${seatBtn("p2", v.p2Open)}</div>
      ${v.resetAvailable ? `<button class="btn" data-op="reset" data-key="reset">CLEAR ABANDONED TABLE</button>` : ""}
    </div>`;
}

function busyScreen(id, v) {
  return `
    <div class="message-screen">
      <h1 class="big-title">${chroma(`TABLE #${pad(id, 3)}`)}</h1>
      <p>TWO PLAYERS ARE ALREADY FIGHTING HERE.</p>
      <p class="warn" data-clock="busy" data-base="${v.secondsUntilTakeover}">TAKEOVER IN ${v.secondsUntilTakeover}S</p>
    </div>`;
}

function stagingScreen(id, v, inviting) {
  const seat = tag(v.seat);
  const code = "code" in v.visibility ? v.visibility.code : null;
  const line = inviting
    ? `CALLING ${esc(inviting.toUpperCase())}…`
    : v.reservedForPartner
      ? "WAITING FOR YOUR RIVAL TO ACCEPT THE REMATCH"
      : code !== null
        ? "SEND YOUR RIVAL THE TABLE AND CODE"
        : "ANYONE ON THE ARCADE FLOOR CAN JOIN";
  return `
    <div class="message-screen staging">
      <h1 class="big-title blink">${chroma(inviting ? "CPU INCOMING" : "WAITING FOR A CHALLENGER")}</h1>
      <div class="staging-card">
        <div class="kv"><span>TABLE</span><b>#${pad(id, 3)}</b></div>
        <div class="kv"><span>YOU ARE</span><b class="seat-${seat}">${SEAT_NAME[seat]}</b></div>
        ${code !== null ? `<div class="kv"><span>CODE</span><b class="code">${esc(code)}</b></div>` : ""}
      </div>
      <p class="dots">${line}</p>
      <div class="row">
        ${v.reservedForPartner || inviting ? "" : `<button class="btn" data-op="copy-link" data-table="${id}" data-seat="${other(seat)}"${code !== null ? ` data-code="${esc(code)}"` : ""}>COPY INVITE LINK</button>`}
        <button class="btn btn-danger" data-op="leave" data-key="leave">CANCEL</button>
      </div>
    </div>`;
}

function rematchOffer(v) {
  return `
    <div class="message-screen">
      <h1 class="big-title challenger">${chroma("HERE COMES A NEW CHALLENGER!")}</h1>
      <p>YOUR RIVAL WANTS A REMATCH AND IS HOLDING ${SEAT_SHORT[tag(v.openSeat)]} FOR YOU.</p>
      <p class="continue blink">CONTINUE?</p>
      <div class="row">
        <button class="btn btn-primary btn-big" data-op="rematch" data-key="rematch">YES</button>
        <button class="btn btn-big" data-op="leave" data-key="leave">NO</button>
      </div>
    </div>`;
}

function endedByOtherScreen() {
  return `
    <div class="message-screen">
      <h1 class="big-title">${chroma("GAME OVER")}</h1>
      <p>THE TABLE SAT IDLE TOO LONG AND WAS HANDED TO OTHER PLAYERS.</p>
      <button class="btn btn-primary" data-op="ack" data-key="ack">OK</button>
    </div>`;
}

function connectingScreen() {
  return `
    <div class="message-screen">
      ${logo()}
      <p class="blink">LOADING…</p>
    </div>`;
}

// ── The arena ────────────────────────────────────────────────────────────

function arenaSkeleton(seat, hi) {
  const side = (s) => `
    <div class="fighter ${s}${s === seat ? " me" : ""}" data-fighter="${s}">
      <div class="fighter-body"><div class="fighter-sprite"></div></div>
      <div class="fighter-shadow"></div>
      <div class="fighter-status"></div>
    </div>`;
  return `
    <section class="arena" data-me="${seat}">
      <div class="hud">
        <div class="hud-tag p1">1P</div>
        <div class="hud-hi"><div class="hi-label">HI</div><div class="hi-score" data-hi>${hi}</div></div>
        <div class="hud-tag p2">2P</div>
        <div class="bar-row">
          <div class="bar p1" data-bar="p1"></div>
          <div class="ko-mark">${chroma("KO")}</div>
          <div class="bar p2" data-bar="p2"></div>
        </div>
        <div class="hud-info" data-info></div>
      </div>
      <div class="stage">
        ${side("p1")}
        <div class="vs">${chroma("VS")}</div>
        ${side("p2")}
        <div class="clash-spark">${sprite("spark")}</div>
        <div class="round-banner" data-banner></div>
      </div>
      <div class="names">
        <div class="name p1">${chroma("PLAYER 1")}${seat === "p1" ? `<span class="you-tag">▲ YOU</span>` : ""}</div>
        <div class="last-round" data-last></div>
        <div class="name p2">${chroma("PLAYER 2")}${seat === "p2" ? `<span class="you-tag">▲ YOU</span>` : ""}</div>
      </div>
      <div class="controls" data-controls></div>
      <div class="warnings" data-warnings></div>
      <div class="result" data-result hidden></div>
    </section>`;
}

function barHtml(game, seat, prevGame) {
  const total = Number(game.winsNeeded);
  const health = Math.max(0, total - Number(scoreOf(game, other(seat))));
  const prevHealth = prevGame ? Math.max(0, total - Number(scoreOf(prevGame, other(seat)))) : health;
  const segs = [];
  for (let i = 0; i < total; i++) {
    // p1's health sits at its outer (left) end, p2's at its right end.
    const idx = seat === "p1" ? i : total - 1 - i;
    const filled = idx < health;
    const lost = !filled && idx < prevHealth;
    segs.push(`<span class="seg-cell${filled ? " on" : ""}${lost ? " lost" : ""}"></span>`);
  }
  const wins = scoreOf(game, seat);
  return `<div class="bar-frame${health === 1 && total > 1 ? " low" : ""}">${segs.join("")}</div><div class="bar-wins">${wins} WIN${wins === 1n ? "" : "S"}</div>`;
}

function lastRoundHtml(game, me) {
  const last = game.lastRound[0];
  if (!last) return `<span class="faint">ROUND 1</span>`;
  const w = roundWinner(last);
  const res = w === "tie" ? "DRAW" : w === me ? "YOU WON" : "RIVAL WON";
  return `<span class="faint">LAST</span>${sprite(moveOf(last.p1Action), "mini")}<span class="faint">VS</span>${sprite(moveOf(last.p2Action), "mini")}<span class="lr-res ${w === "tie" ? "tie" : w === me ? "win" : "lose"}">${res}</span>`;
}

function movesHtml(game) {
  const moves = variantOf(game) === "well" ? MOVES : MOVES.slice(0, 3);
  return `
    <div class="move-row">${plugin.renderActions(game, null)}</div>
    <p class="hint">PICK A MOVE · KEYS 1–${moves.length}</p>`;
}

function verdictOf(end, me, game) {
  const t = tag(end);
  if (t === "finished") {
    const w = tag(end.finished);
    if (w === "draw") return { title: "DRAW GAME", sub: "NOBODY TAKES IT", outcome: "draw" };
    const won = w === `${me}Wins`;
    const perfect = won && scoreOf(game, other(me)) === 0n && game.winsNeeded > 1n;
    return won
      ? { title: "YOU WIN!", sub: perfect ? "PERFECT!" : "WINNER STAYS ON", outcome: "win" }
      : { title: "YOU LOSE", sub: "GAME OVER", outcome: "lose" };
  }
  if (t === "claimed") {
    return tag(end.claimed) === me
      ? { title: "YOU WIN!", sub: "YOUR RIVAL TIMED OUT", outcome: "win" }
      : { title: "TIME OVER", sub: "YOU WAITED TOO LONG", outcome: "lose" };
  }
  return tag(end.aborted) === me
    ? { title: "FORFEIT", sub: "YOU LEFT THE MATCH", outcome: "lose" }
    : { title: "YOU WIN!", sub: "YOUR RIVAL FLED", outcome: "win" };
}

function resultHtml(v, me) {
  const { title, sub, outcome } = verdictOf(v.end, me, v.finalGame);
  return `
    <div class="result-card ${outcome}">
      <h1 class="result-title">${chroma(title)}</h1>
      <p class="result-sub blink-slow">${sub}</p>
      <p class="result-score">${v.finalGame.p1Score} – ${v.finalGame.p2Score} · ${v.steps} ROUND${v.steps === 1n ? "" : "S"}</p>
      <div class="row">
        <button class="btn btn-primary btn-big" data-op="rematch" data-key="rematch">REMATCH ⏎</button>
        <button class="btn btn-big" data-op="leave" data-key="leave">EXIT</button>
      </div>
    </div>`;
}

// ── Mounting ─────────────────────────────────────────────────────────────

export function mountArcade({ client, els, bots, hiScore }) {
  const { screen, alert, fx, flash, cabinet, sid, newSid, codeDialog, confirmDialog } = els;

  let hi = "000000";
  const setHi = (score) => {
    hi = pad(score, 6);
    for (const el of document.querySelectorAll("[data-hi]")) el.textContent = hi;
  };
  hiScore.then((s) => s !== null && setHi(s)).catch(() => {});

  sid.textContent = shortId(playerKeyOf(client.sid));
  sid.title = client.sid;
  newSid.addEventListener("click", () => void client.regenerateSid());

  // ── Dialogs ──
  const ask = (dialog, map) =>
    new Promise((resolve) => {
      const finish = (value) => {
        dialog.removeEventListener("click", onClick);
        dialog.removeEventListener("cancel", onCancel);
        if (dialog.open) dialog.close();
        resolve(map(value));
      };
      const onClick = (ev) => {
        const b = ev.target.closest("button[value]");
        if (!b) return;
        ev.preventDefault();
        sfx.play(b.value === "" ? "back" : "select");
        finish(b.value);
      };
      const onCancel = (ev) => {
        ev.preventDefault();
        finish("");
      };
      dialog.addEventListener("click", onClick);
      dialog.addEventListener("cancel", onCancel);
      dialog.showModal();
    });
  const askCode = () => {
    const input = codeDialog.querySelector("input");
    input.value = "";
    const p = ask(codeDialog, (rv) => (rv === "ok" ? input.value : null));
    input.focus();
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        codeDialog.querySelector('button[value="ok"]').click();
      }
    };
    return p;
  };
  const confirmQuit = () => ask(confirmDialog, (rv) => rv === "yes");

  // ── Big centre-screen text, screen shake and flash ──
  function bigText(text, cls, ms) {
    const el = document.createElement("div");
    el.className = `big-text ${cls}`;
    el.style.setProperty("--dur", `${ms}ms`);
    el.innerHTML = chroma(text);
    fx.appendChild(el);
    return sleep(ms).then(() => el.remove());
  }
  function shake(cls = "shake") {
    cabinet.classList.remove("shake", "shake-hard");
    void cabinet.offsetWidth;
    cabinet.classList.add(cls);
    setTimeout(() => cabinet.classList.remove(cls), 450);
  }
  function doFlash(color = "#fff") {
    flash.style.setProperty("--flash", color);
    flash.classList.remove("on");
    void flash.offsetWidth;
    flash.classList.add("on");
  }

  // ── State ──
  let screenKey = null; // which non-arena screen is mounted
  let arena = null; // { el, tableId, gen, step, seat, game, finished, resultShown }
  let animating = false;
  let inviting = null;
  let myPick = null; // { key, move }: this tab's own pick, shown while locked in
  let cpuBots = [];
  const pickKey = (id, gen, step) => `${id}:${gen}:${step}`;

  const shownStatus = (state) => withLocalMove(state.status, state.pending, plugin.applyLocal.bind(plugin));

  function present() {
    if (animating) return;
    const state = client.getState();
    const shown = shownStatus(state);
    dropInviteIfSeated(shown);
    const at = atTableOf(shown);
    const t = at ? tag(at.view) : null;
    if (t === "inGame" || t === "debrief") presentArena(at, t, state);
    else presentScreen(shown);
    syncClocks();
    syncButtons(state);
  }

  // ── Plain screens ──
  function mount(key, html) {
    arena = null;
    screenKey = key;
    screen.innerHTML = `<div class="screen-enter">${html}</div>`;
  }

  function presentScreen(shown) {
    if (shown === null) {
      if (screenKey !== "connecting") mount("connecting", connectingScreen());
      return;
    }
    if ("browsing" in shown) {
      if (screenKey !== "browsing") {
        mount("browsing", browsingSkeleton(hi));
        renderCpuRow();
      }
      const list = screen.querySelector("#table-list");
      const html = tableList(shown.browsing.tables);
      if (list.dataset.html !== html) {
        list.innerHTML = html;
        list.dataset.html = html;
      }
      maybeAutoJoin(shown.browsing.tables);
      return;
    }
    const { id, view } = shown.atTable;
    const t = tag(view);
    const v = view[t];
    let html;
    switch (t) {
      case "lobby":
        html = tableLobby(id, v);
        break;
      case "busy":
        html = busyScreen(id, v);
        break;
      case "stagingYou":
        html = stagingScreen(id, v, inviting);
        break;
      case "awaitingRematch":
        html = rematchOffer(v);
        break;
      case "endedByOther":
        html = endedByOtherScreen();
        break;
      default:
        html = `<div class="message-screen"><p>UNKNOWN VIEW ${esc(t)}</p></div>`;
    }
    const key = `${t}:${id}`;
    if (screenKey !== key) {
      mount(key, html);
      if (t === "awaitingRematch") sfx.play("challenger");
      if (t === "endedByOther") sfx.play("lose");
    } else {
      const inner = screen.firstElementChild;
      if (inner.dataset.html !== html) inner.innerHTML = html;
      inner.dataset.html = html;
    }
  }

  // ── Arena ──
  function presentArena(at, t, state) {
    const v = at.view[t];
    const seat = tag(v.seat);
    const live = t === "inGame";
    const game = live ? v.game : v.finalGame;
    const step = live ? v.step : v.steps;
    const same = arena !== null && arena.tableId === at.id && arena.gen === v.gen;
    if (!same) {
      screenKey = null;
      screen.innerHTML = arenaSkeleton(seat, hi);
      arena = { el: screen.firstElementChild, tableId: at.id, gen: v.gen, step, seat, game, resultShown: false };
      drawArena(v, live, state);
      if (live && step === 0n) {
        sfx.play("challenger");
        void bigText("HERE COMES A NEW CHALLENGER!", "challenger", 1700);
      }
      return;
    }
    const newRound = step > arena.step && game.lastRound.length === 1;
    if (newRound) {
      void revealRound(v, live, at);
      return;
    }
    drawArena(v, live, state);
  }

  const q = (sel) => arena.el.querySelector(sel);
  const setHtml = (el, html) => {
    if (el.dataset.html === html) return;
    el.innerHTML = html;
    el.dataset.html = html;
  };

  function setFighter(seat, spriteName, status, cls = "") {
    const f = q(`[data-fighter="${seat}"]`);
    setHtml(f.querySelector(".fighter-sprite"), sprite(spriteName));
    setHtml(f.querySelector(".fighter-status"), status);
    f.dataset.state = cls;
  }

  function drawHud(game, prevGame) {
    setHtml(q('[data-bar="p1"]'), barHtml(game, "p1", prevGame));
    setHtml(q('[data-bar="p2"]'), barHtml(game, "p2", prevGame));
    setHtml(q("[data-last]"), lastRoundHtml(game, arena.seat));
  }

  function drawArena(v, live, state) {
    const me = arena.seat;
    const opp = other(me);
    const game = live ? v.game : v.finalGame;
    arena.step = live ? v.step : v.steps;
    arena.game = game;
    drawHud(game, null);
    setHtml(
      q("[data-info]"),
      `${live ? `ROUND ${v.step + 1n}` : "FINAL"} · FIRST TO ${game.winsNeeded} · ${VARIANT_LABEL[variantOf(game)]}`
    );

    if (live) {
      q("[data-result]").hidden = true;
      arena.resultShown = false;
      const mine = myPick && myPick.key === pickKey(arena.tableId, v.gen, v.step) ? myPick.move : null;
      if (v.youSubmitted) setFighter(me, mine ?? "mystery", `<span class="ok">LOCKED IN</span>`, "locked");
      else setFighter(me, "mystery", `<span class="blink">CHOOSE!</span>`, "idle");
      if (v.oppSubmitted) setFighter(opp, "mystery", `<span class="ok">READY!</span>`, "ready");
      else setFighter(opp, "mystery", `<span class="dots">THINKING</span>`, "idle");

      const role = claimRoleOf(v);
      const controls = v.youSubmitted
        ? `<p class="waiting dots">WAITING FOR YOUR RIVAL</p>`
        : movesHtml(game);
      setHtml(
        q("[data-controls]"),
        `${controls}<div class="row small-row">
          ${role === "waiting" ? `<button class="btn btn-primary" data-op="claim" data-key="claim-win" data-clock="claim-button" data-base="${v.secondsUntilClaimable}" ${v.claimWinAvailable ? "" : "hidden"}>CLAIM WIN</button>` : ""}
          <button class="btn btn-small btn-danger" data-op="forfeit" data-key="leave">QUIT</button>
        </div>`
      );
      setHtml(
        q("[data-warnings]"),
        `${v.youSubmitted ? "" : `<p class="warn" data-clock="idle" data-base="${v.secondsUntilIdleReset}" data-threshold="${idleWarningThreshold(v.idleTimeoutSecs)}" hidden></p>`}
         ${role === null ? "" : `<p class="warn" data-clock="claim" data-role="${role}" data-base="${v.secondsUntilClaimable}" data-threshold="${claimWarningThreshold(v.claimTimeoutSecs)}" hidden></p>`}`
      );
    } else {
      // Debrief: the final round's two picks stay on the fighters.
      const last = game.lastRound[0];
      const w = last ? roundWinner(last) : null;
      for (const s of ["p1", "p2"]) {
        if (last) {
          const pick = moveOf(s === "p1" ? last.p1Action : last.p2Action);
          setFighter(s, pick, `<span>${MOVES.find((m) => m.key === pick).label}</span>`, w === "tie" ? "" : w === s ? "winner" : "loser");
        } else {
          setFighter(s, "mystery", "", "");
        }
      }
      setHtml(q("[data-controls]"), "");
      setHtml(q("[data-warnings]"), "");
      const res = q("[data-result]");
      setHtml(res, resultHtml(v, me));
      if (!arena.resultShown) {
        arena.resultShown = true;
        res.hidden = false;
        const { outcome } = verdictOf(v.end, me, game);
        sfx.play(outcome === "win" ? "win" : outcome === "lose" ? "lose" : "tie");
      }
    }
  }

  async function revealRound(v, live, at) {
    animating = true;
    const me = arena.seat;
    const prevGame = arena.game;
    const game = live ? v.game : v.finalGame;
    const round = game.lastRound[0];
    const w = roundWinner(round);
    const finished = !live && tag(v.end) === "finished";
    try {
      setHtml(q("[data-controls]"), `<p class="waiting">&nbsp;</p>`);
      setHtml(q("[data-warnings]"), "");
      setFighter("p1", "mystery", "", "shaking");
      setFighter("p2", "mystery", "", "shaking");

      sfx.play("ready");
      await bigText("READY?", "ready", 900);
      sfx.play("fight");
      doFlash("#ff2bd6");
      shake();
      await bigText("FIGHT!", "fight", 750);

      for (const s of ["p1", "p2"]) {
        const pick = moveOf(s === "p1" ? round.p1Action : round.p2Action);
        setFighter(s, pick, `<span>${MOVES.find((m) => m.key === pick).label}</span>`, "reveal");
      }
      await sleep(380);
      arena.el.classList.add("clashing");
      await sleep(180);
      q(".clash-spark").classList.remove("pop");
      void arena.el.offsetWidth;
      q(".clash-spark").classList.add("pop");
      if (w === "tie") {
        sfx.play("tie");
        shake();
        for (const s of ["p1", "p2"]) q(`[data-fighter="${s}"]`).dataset.state = "bounced";
      } else {
        sfx.play("hit");
        doFlash("#ffffff");
        shake("shake-hard");
        q(`[data-fighter="${w}"]`).dataset.state = "winner";
        q(`[data-fighter="${other(w)}"]`).dataset.state = "loser";
      }
      drawHud(game, prevGame);
      const banner = q("[data-banner]");
      banner.className = `round-banner show ${w === "tie" ? "tie" : w === me ? "win" : "lose"}`;
      banner.innerHTML = chroma(w === "tie" ? "DRAW!" : w === me ? "YOU TAKE THE ROUND" : "RIVAL TAKES THE ROUND");
      await sleep(260);
      arena.el.classList.remove("clashing");
      if (!finished) sfx.play(w === "tie" ? "blip" : w === me ? "roundWin" : "roundLose");
      await sleep(1250);
      banner.className = "round-banner";
      if (finished) {
        sfx.play("ko");
        doFlash("#ff3d5a");
        shake("shake-hard");
        arena.el.classList.add("slowmo");
        await bigText("K.O.", "ko", 1600);
        arena.el.classList.remove("slowmo");
      }
    } finally {
      // Draw whatever is newest now: the next round, the debrief, or a
      // screen the server moved on to meanwhile.
      animating = false;
      if (arena) arena.step = live ? v.step : v.steps;
      present();
    }
  }

  // ── CPU (bots registered with the backend) ──
  function renderCpuRow() {
    const row = screen.querySelector("#cpu-row");
    if (!row) return;
    row.innerHTML = cpuBots.length
      ? cpuBots
          .map(
            (b, i) =>
              `<button class="btn btn-cpu" data-op="cpu" data-bot="${i}" title="Play against ${esc(b.label)}">VS CPU · ${esc(b.label.toUpperCase())}</button>`
          )
          .join("")
      : "";
  }
  bots
    .list()
    .then((list) => {
      cpuBots = list;
      renderCpuRow();
      syncButtons(client.getState());
    })
    .catch(() => {});

  // ── Invite links: #join=<table>&seat=<p1|p2>&code=<code> ──
  let autoJoin = null;
  function readInvite() {
    try {
      const h = new URLSearchParams(location.hash.slice(1));
      if (h.has("join")) autoJoin = { id: BigInt(h.get("join")), seat: h.get("seat"), code: h.get("code") };
    } catch (_) {}
  }
  readInvite();
  // A link pasted into a tab already showing the page changes only the hash.
  window.addEventListener("hashchange", () => {
    readInvite();
    const status = client.getState().status;
    if (status && "browsing" in status) maybeAutoJoin(status.browsing.tables);
  });
  function maybeAutoJoin(tables) {
    if (!autoJoin) return;
    const j = autoJoin;
    autoJoin = null;
    history.replaceState(null, "", location.pathname + location.search);
    const r = tables.find((t) => t.id === j.id);
    if (!r) return client.showError(`Table #${j.id} is no longer open.`);
    const seat = j.seat === "p1" || j.seat === "p2" ? j.seat : r.p1Open ? "p1" : "p2";
    void client.joinTable(r.id, seat, j.code);
  }
  // Already seated somewhere: an invite link must not pull the player away later.
  function dropInviteIfSeated(shown) {
    if (autoJoin && shown && !("browsing" in shown)) {
      autoJoin = null;
      history.replaceState(null, "", location.pathname + location.search);
      client.showError("Finish or leave this game before joining another table.");
    }
  }

  // ── Form helpers ──
  const formSeat = () => screen.querySelector('input[name="ng-seat"]:checked')?.value ?? "p1";
  const formOptions = () => ({
    variant: { [screen.querySelector('input[name="ng-variant"]:checked')?.value ?? "classic"]: null },
    winsNeeded: BigInt(screen.querySelector("#ng-wins")?.textContent ?? "3"),
  });
  const formVisibility = () => {
    const coded = screen.querySelector('input[name="ng-vis"]:checked')?.value === "code";
    return coded ? { code: screen.querySelector("#ng-code").value.trim() } : { open: null };
  };

  screen.addEventListener("change", (ev) => {
    if (ev.target.name === "ng-vis") {
      const coded = ev.target.value === "code";
      screen.querySelector(".code-field").hidden = !coded;
      if (coded) screen.querySelector("#ng-code").focus();
    }
    if (ev.target.type === "radio") sfx.play("select");
  });

  // ── Clicks ──
  screen.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b || b.disabled) return;
    sfx.unlockAudio();
    if (b.dataset.op === "wins-up" || b.dataset.op === "wins-down") {
      const out = screen.querySelector("#ng-wins");
      const n = Math.min(9, Math.max(1, Number(out.textContent) + (b.dataset.op === "wins-up" ? 1 : -1)));
      out.textContent = String(n);
      return sfx.play("select");
    }
    if (b.dataset.op === "copy-link") {
      const p = new URLSearchParams({ join: b.dataset.table, seat: b.dataset.seat });
      if (b.dataset.code) p.set("code", b.dataset.code);
      const url = `${location.origin}${location.pathname}#${p}`;
      try {
        await navigator.clipboard.writeText(url);
        b.textContent = "LINK COPIED!";
        sfx.play("coin");
      } catch (_) {
        window.prompt("Invite link", url);
      }
      return;
    }
    if (client.getState().pending || animating) return;
    if (b.dataset.act) {
      const move = JSON.parse(b.dataset.act);
      const v = arena && client.getState().status?.atTable?.view?.inGame;
      if (v) myPick = { key: pickKey(arena.tableId, v.gen, v.step), move: moveOf(move) };
      sfx.play("lock");
      return void client.submit(move);
    }
    switch (b.dataset.op) {
      case "create": {
        const visibility = formVisibility();
        if ("code" in visibility && visibility.code === "") {
          sfx.play("error");
          return client.showError("Type an access code, or make the table open.");
        }
        const seat = formSeat();
        b.dataset.key = `create:${seat}`;
        sfx.play("coin");
        return void client.createTable(seat, visibility, formOptions());
      }
      case "cpu": {
        const bot = cpuBots[Number(b.dataset.bot)];
        sfx.play("coin");
        return void bots.challenge(bot, formSeat(), formOptions());
      }
      case "join": {
        let code = null;
        if ("protected" in b.dataset) {
          code = await askCode();
          if (code === null) return;
        }
        sfx.play("coin");
        return void client.joinTable(BigInt(b.dataset.table), b.dataset.seat, code);
      }
      case "forfeit":
        if (await confirmQuit()) void client.leave();
        return;
      case "leave":
        sfx.play("back");
        return void client.leave();
      case "rematch":
        sfx.play("coin");
        return void client.rematch();
      case "reset":
        return void client.reset();
      case "claim":
        sfx.play("select");
        return void client.claimWin();
      case "ack":
        return void client.ackEnded();
    }
  });

  // Hover blips, throttled.
  let lastBlip = 0;
  screen.addEventListener("pointerover", (ev) => {
    const b = ev.target.closest("button, .seg label");
    if (!b || b.disabled || b.contains(ev.relatedTarget)) return;
    const now = performance.now();
    if (now - lastBlip > 60) {
      lastBlip = now;
      sfx.play("blip");
    }
  });

  // ── Keyboard ──
  document.addEventListener("keydown", (ev) => {
    if (ev.target.closest?.("input, textarea, dialog") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (arena) {
      const move = MOVES.find((m) => m.hotkeys.includes(k));
      if (move) {
        const btn = arena.el.querySelector(`button[data-act='${JSON.stringify({ [move.key]: null })}']`);
        if (btn && !btn.disabled) {
          btn.classList.add("pressed");
          btn.click();
        }
        return;
      }
      if (k === "enter") {
        const btn = arena.el.querySelector('[data-result]:not([hidden]) button[data-op="rematch"]');
        if (btn && !btn.disabled) btn.click();
      }
    }
  });

  // ── Syncing chrome ──
  function syncButtons(state) {
    const key = state.pending?.key ?? null;
    const dead = state.connection === "closed";
    for (const b of screen.querySelectorAll("button")) {
      if (b.dataset.naturallyOff === undefined) b.dataset.naturallyOff = b.disabled ? "1" : "0";
      const own = b.dataset.key ?? (b.dataset.act !== undefined ? `act:${b.dataset.act}` : null);
      const gated = own !== null || b.dataset.op === "cpu";
      b.disabled = b.dataset.naturallyOff === "1" || (gated && (dead || key !== null || animating));
      b.classList.toggle("busy", key !== null && own === key);
    }
    newSid.disabled = state.identityLocked;
  }

  let lastError = null;
  function syncAlert(state) {
    let text = null;
    let reload = false;
    if (state.connection === "closed") {
      text = "CONNECTION LOST";
      reload = true;
    } else if (state.error) text = state.error;
    else if (state.connection === "reconnecting") text = "SIGNAL LOST · RECONNECTING…";
    alert.hidden = text === null;
    if (text !== null) {
      alert.innerHTML = `<span class="alert-icon">!</span><span class="alert-text">${esc(text.toUpperCase())}</span>${reload ? `<button class="btn btn-small" id="reload">RELOAD</button>` : ""}`;
      alert.querySelector("#reload")?.addEventListener("click", () => location.reload());
    }
    if (state.error && state.error !== lastError) sfx.play("error");
    lastError = state.error;
  }

  // ── Clocks, patched in place once a second ──
  let lastTick = null;
  function syncClocks() {
    const at = client.getState().statusAt;
    for (const el of screen.querySelectorAll("[data-clock]")) {
      const base = BigInt(el.dataset.base ?? "0");
      const threshold = BigInt(el.dataset.threshold ?? "0");
      switch (el.dataset.clock) {
        case "wait": {
          if (el.textContent === "IN GAME") break;
          el.textContent = `${localSecondsElapsed(base, at)}S`;
          break;
        }
        case "busy":
          el.textContent = `TAKEOVER IN ${localSecondsLeft(base, at)}S`;
          break;
        case "idle": {
          const left = localSecondsLeft(base, at);
          el.hidden = left > threshold;
          el.textContent = left <= 0n ? "MOVE NOW! THIS TABLE IS UP FOR GRABS" : `MOVE! TABLE ABANDONED IN ${left}S`;
          break;
        }
        case "claim": {
          const left = localSecondsLeft(base, at);
          const waiting = el.dataset.role === "waiting";
          el.hidden = (waiting && left <= 0n) || left > threshold;
          el.textContent = waiting
            ? `YOUR RIVAL IS AFK · CLAIM THE WIN ${left <= 0n ? "NOW" : `IN ${left}S`}`
            : `MOVE! YOUR RIVAL CAN CLAIM THE WIN ${left <= 0n ? "NOW" : `IN ${left}S`}`;
          if (!waiting && left > 0n && left <= 5n && lastTick !== left) {
            lastTick = left;
            sfx.play("tick");
          }
          break;
        }
        case "claim-button":
          el.hidden = localSecondsLeft(base, at) > 0n;
          break;
      }
    }
  }
  setInterval(syncClocks, 1000);

  // ── Wiring ──
  present();
  syncAlert(client.getState());
  client.subscribe((state, prev) => {
    if (state.status !== prev.status || state.pending !== prev.pending) present();
    else syncButtons(state);
    if (state.error !== prev.error || state.connection !== prev.connection) syncAlert(state);
  });

  return {
    setInviting(label) {
      inviting = label;
      present();
    },
    setHi,
  };
}
