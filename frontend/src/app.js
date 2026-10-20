// Bootstrap for RPS Arcade: find the backend, build the actor and
// transport, create duel-game-core's headless client and mount the arcade
// UI over it. Bundled by esbuild (../build.js) into dist/app.js.

import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env";
import { Principal } from "@icp-sdk/core/principal";
import { buildBotPlayIdlFactory, makeIdlFactory } from "@research-ag/duel-game-core/idl.js";
import { atTableOf, createDuelClient, errText, tag, viewOf } from "@research-ag/duel-game-core/client.js";
import { connectTransport } from "@research-ag/duel-game-core/transport.js";
import { resolveAnonymousIdentity } from "@research-ag/duel-game-core/anon-identity.js";
import { deriveHost } from "@research-ag/duel-game-core/ic-env.js";
import { botDisplayName, esc, parseCanisterPlayer, playerKeyOf } from "@research-ag/duel-game-core/render.js";
import { plugin } from "./rps-plugin.js";
import { mountArcade } from "./arcade-ui.js";
import * as sfx from "./sfx.js";

// The live Rock-Paper-Scissors game. Used when the page's canister does
// not publish PUBLIC_CANISTER_ID:backend in its ic_env cookie (a page
// served from localhost or any other static host).
const BACKEND = "ghjib-pyaaa-aaaac-bga5a-cai";
// Every mainnet backend is reached through icp0.io, whatever the page's
// own address is.
const MAINNET_HOST = "https://icp0.io";

const env = safeGetCanisterEnv();
const canisterId = env?.["PUBLIC_CANISTER_ID:backend"] ?? BACKEND;
// Only a page served by a local replica (icp network) talks to a local
// backend; it carries that network's root key in the cookie.
const localNetwork =
  env?.["PUBLIC_CANISTER_ID:backend"] !== undefined &&
  env?.IC_ROOT_KEY !== undefined &&
  /(^|\.)localhost$|^127\.0\.0\.1$/.test(location.hostname);

const $ = (id) => document.getElementById(id);

// ── Cosmetic toggles: CRT filter and sound ───────────────────────────────

function pref(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch (_) {
    return fallback;
  }
}
function setPref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {}
}

const crtBtn = $("crt-toggle");
const soundBtn = $("sound-toggle");
function applyCrt(on) {
  document.body.classList.toggle("crt-off", !on);
  crtBtn.textContent = on ? "CRT ON" : "CRT OFF";
  crtBtn.setAttribute("aria-pressed", String(on));
}
function applySound() {
  const muted = sfx.isMuted();
  soundBtn.textContent = muted ? "♪ OFF" : "♪ ON";
  soundBtn.setAttribute("aria-pressed", String(!muted));
}
applyCrt(pref("rps-arcade-crt", "1") === "1");
applySound();
const toggleCrt = () => {
  const on = document.body.classList.contains("crt-off");
  setPref("rps-arcade-crt", on ? "1" : "0");
  applyCrt(on);
  sfx.play("select");
};
const toggleSound = () => {
  sfx.setMuted(!sfx.isMuted());
  applySound();
  sfx.play("select");
};
crtBtn.addEventListener("click", toggleCrt);
soundBtn.addEventListener("click", toggleSound);
document.addEventListener("keydown", (ev) => {
  if (ev.target.closest?.("input, textarea, dialog") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === "m" || ev.key === "M") toggleSound();
  if (ev.key === "c" || ev.key === "C") toggleCrt();
});
document.addEventListener("pointerdown", () => sfx.unlockAudio(), { capture: true });

// ── PRESS START gate (once per tab; also unlocks audio) ──────────────────

const gate = $("gate");
let started = false;
try {
  started = sessionStorage.getItem("rps-arcade-started") === "1";
} catch (_) {}
if (!started) {
  gate.hidden = false;
  const go = () => {
    sfx.unlockAudio();
    setTimeout(() => sfx.play("coin"), 30);
    gate.classList.add("leaving");
    setTimeout(() => (gate.hidden = true), 450);
    try {
      sessionStorage.setItem("rps-arcade-started", "1");
    } catch (_) {}
    gate.removeEventListener("click", go);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      go();
    }
  };
  gate.addEventListener("click", go);
  document.addEventListener("keydown", onKey);
}

// ── Backend connection ───────────────────────────────────────────────────

// One persisted anonymous key per tab: a second tab is a second player.
const session = resolveAnonymousIdentity();
const agent = await HttpAgent.create({
  host: localNetwork ? deriveHost() : MAINNET_HOST,
  identity: session.identity,
  ...(localNetwork ? { rootKey: env.IC_ROOT_KEY } : {}),
});
const actor = Actor.createActor(makeIdlFactory(plugin.idlTypes), { agent, canisterId });
const transport = connectTransport({ actor, gameIdlTypes: plugin.idlTypes });
const client = createDuelClient({ transport, session });

// ── High scores (optional on the backend; failures stay quiet) ───────────

const leaderboard = () => actor.get_leaderboard().catch(() => []);
const listBots = () => actor.list_bots().catch(() => []);

const ui = mountArcade({
  client,
  els: {
    screen: $("screen"),
    alert: $("alert"),
    fx: $("fx"),
    flash: $("flash"),
    cabinet: $("cabinet"),
    sid: $("sid"),
    newSid: $("new-sid"),
    codeDialog: $("code-dialog"),
    confirmDialog: $("confirm-dialog"),
  },
  hiScore: leaderboard().then((es) => (es.length ? es.reduce((m, e) => (e.score > m ? e.score : m), 0n) : null)),
  bots: {
    list: async () =>
      (await listBots()).flatMap((b) =>
        (b.complexities.length ? b.complexities : [{ complexity: "Default" }]).map((c) => ({
          principalText: b.principal.toText(),
          name: b.name,
          complexity: c.complexity,
          label: c.complexity === "Default" ? b.name : botDisplayName(b.name, c.complexity),
        }))
      ),
    challenge: (bot, seat, options) => void startBotGame(bot, seat, options),
  },
});

const scoresPanel = $("scores-panel");
const scoresBody = $("scores-body");
$("scores-toggle").addEventListener("click", async () => {
  sfx.play("select");
  scoresPanel.hidden = false;
  scoresBody.innerHTML = `<p class="blink">LOADING…</p>`;
  const [entries, bots] = await Promise.all([leaderboard(), listBots()]);
  const names = new Map(bots.map((b) => [b.principal.toText(), b.name]));
  const me = playerKeyOf(session.sid);
  const rows = [...entries].sort((a, b) => (a.score === b.score ? 0 : a.score > b.score ? -1 : 1)).slice(0, 10);
  if (rows.length) ui.setHi(rows[0].score);
  const nameOf = (player) => {
    const bot = parseCanisterPlayer(player);
    if (bot) return `CPU ${names.get(bot.principal) ?? bot.principal.slice(0, 5)}`;
    return player.length > 11 ? `${player.slice(0, 5)}…${player.slice(-3)}` : player;
  };
  const rank = (i) => ["1ST", "2ND", "3RD"][i] ?? `${i + 1}TH`;
  scoresBody.innerHTML = rows.length
    ? `<ol class="scores">${rows
        .map(
          (e, i) =>
            `<li class="${e.player === me ? "you" : ""} rank-${i + 1}"><span>${rank(i)}</span><span title="${esc(e.player)}">${esc(nameOf(e.player).toUpperCase())}${e.player === me ? " ◀ YOU" : ""}</span><span>${String(e.score).padStart(6, "0")}</span></li>`
        )
        .join("")}</ol>`
    : `<p>NO RECORDS YET. BE THE FIRST!</p>`;
});
$("scores-back").addEventListener("click", () => {
  sfx.play("back");
  scoresPanel.hidden = true;
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !scoresPanel.hidden) scoresPanel.hidden = true;
});

// ── VS CPU: a bot is seated by calling its own canister's `play` ─────────

const hostPrincipal = Principal.fromText(canisterId);
const LAST_BOT_KEY = "rps-arcade-last-bot";

function stagingOf(status) {
  const at = atTableOf(status);
  const v = viewOf(status, "stagingYou");
  if (!at || !v) return null;
  return {
    tableId: at.id,
    openSeat: tag(v.seat) === "p1" ? { p2: null } : { p1: null },
    code: "code" in v.visibility ? [v.visibility.code] : [],
  };
}

let lastBot = null;
try {
  const saved = JSON.parse(sessionStorage.getItem(LAST_BOT_KEY));
  if (saved) lastBot = { ...saved, tableId: BigInt(saved.tableId) };
} catch (_) {}
function setLastBot(bot) {
  lastBot = bot;
  try {
    if (bot === null) sessionStorage.removeItem(LAST_BOT_KEY);
    else sessionStorage.setItem(LAST_BOT_KEY, JSON.stringify({ ...bot, tableId: bot.tableId.toString() }));
  } catch (_) {}
}

let invitingLabel = null;
function setInviting(label) {
  invitingLabel = label;
  ui.setInviting(label);
}

async function inviteBot(bot, staging) {
  setInviting(bot.label);
  try {
    const botActor = Actor.createActor(buildBotPlayIdlFactory, { agent, canisterId: bot.principalText });
    const res = await botActor.play(hostPrincipal, staging.tableId, staging.openSeat, staging.code, bot.complexity);
    if ("err" in res) throw new Error(errText(res.err));
    setLastBot({ ...bot, tableId: staging.tableId });
    if (stagingOf(client.getState().status) === null) setInviting(null);
  } catch (e) {
    client.showError(e && e.message ? e.message : String(e));
    setInviting(null);
  }
}

// A CPU table always gets a random access code, so no human wanders in.
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(36).slice(-1)).join("").toUpperCase();

async function startBotGame(bot, seat, options) {
  setInviting(bot.label);
  const res = await client.createTable(seat, { code: `CPU${randomCode()}` }, options);
  const staging = res.ok ? stagingOf(res.view) : null;
  if (staging === null) {
    setInviting(null);
    return;
  }
  await inviteBot(bot, staging);
}

// A rematch stages the same table with the seat held for the bot's
// session; re-issue the identical `play` once per staging.
let reinvited = null;
client.subscribe((state) => {
  if (state.status === null) return;
  const at = atTableOf(state.status);
  // The CPU has taken its seat (or the table is gone): stop "calling".
  if (invitingLabel !== null && at && !viewOf(state.status, "stagingYou")) setInviting(null);
  if (lastBot && !(at && at.id === lastBot.tableId)) setLastBot(null);
  const v = viewOf(state.status, "stagingYou");
  if (!lastBot || !at || !v || !v.reservedForPartner) return;
  const key = `${at.id}:${v.gen}`;
  if (reinvited === key) return;
  reinvited = key;
  void inviteBot(lastBot, stagingOf(state.status));
});
