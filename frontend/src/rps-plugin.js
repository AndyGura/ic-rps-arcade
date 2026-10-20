// GamePlugin for the live Rock-Paper-Scissors backend
// (ghjib-pyaaa-aaaac-bga5a-cai). Types copied literally from its
// GET /semantics and checked against its Candid (backend.did). `legal()`
// is a cosmetic echo of the rules; the backend stays the judge.

import { actionAttr, esc } from "@research-ag/duel-game-core/render.js";
import { sprite } from "./sprites.js";

export const SEAT_NAME = { p1: "PLAYER 1", p2: "PLAYER 2" };
export const SEAT_SHORT = { p1: "1P", p2: "2P" };

export const MOVES = [
  { key: "rock", label: "ROCK", hotkeys: ["1", "r"] },
  { key: "paper", label: "PAPER", hotkeys: ["2", "p"] },
  { key: "scissors", label: "SCISSORS", hotkeys: ["3", "s"] },
  { key: "well", label: "WELL", hotkeys: ["4", "w"] },
];

export const VARIANT_LABEL = { classic: "CLASSIC", well: "+WELL" };

export const variantOf = (game) => Object.keys(game.variant)[0];
export const moveOf = (action) => Object.keys(action)[0];

/// The moves this table offers: well only in the well variant (CLIENT NOTES).
export function movesFor(game) {
  return variantOf(game) === "well" ? MOVES : MOVES.filter((m) => m.key !== "well");
}

/// Rejected: well in the classic variant. Everything else is legal.
export function legal(game, key) {
  return key !== "well" || variantOf(game) === "well";
}

const BEATS = {
  rock: ["scissors"],
  paper: ["rock", "well"],
  scissors: ["paper"],
  well: ["rock", "scissors"],
};

/// Who took a round: "p1", "p2" or "tie".
export function roundWinner(round) {
  const a = moveOf(round.p1Action);
  const b = moveOf(round.p2Action);
  if (a === b) return "tie";
  return BEATS[a].includes(b) ? "p1" : "p2";
}

export const scoreOf = (game, seat) => (seat === "p1" ? game.p1Score : game.p2Score);

export const plugin = {
  idlTypes({ IDL }) {
    const Action = IDL.Variant({
      rock: IDL.Null,
      paper: IDL.Null,
      scissors: IDL.Null,
      well: IDL.Null,
    });
    const Round = IDL.Record({ p1Action: Action, p2Action: Action });
    const Variant = IDL.Variant({ classic: IDL.Null, well: IDL.Null });
    const View = IDL.Record({
      p1Score: IDL.Nat,
      p2Score: IDL.Nat,
      lastRound: IDL.Opt(Round),
      variant: Variant,
      winsNeeded: IDL.Nat,
    });
    const Options = IDL.Record({ variant: Variant, winsNeeded: IDL.Nat });
    return { Action, View, Options };
  },

  seatLabel(seat) {
    return SEAT_NAME[seat];
  },

  optionChoices() {
    return [
      { key: "classic", label: "Classic", options: { variant: { classic: null }, winsNeeded: 3n } },
      { key: "well", label: "With well", options: { variant: { well: null }, winsNeeded: 3n } },
    ];
  },

  formatOptions(options) {
    const v = VARIANT_LABEL[Object.keys(options.variant)[0]] ?? VARIANT_LABEL.classic;
    return `${v} · FT${options.winsNeeded}`;
  },

  // The arcade UI draws its own arena; this compact board (scores plus the
  // last round's two picks) keeps the plugin usable on its own.
  renderBoard(game, mySeat, oppSeat) {
    const last = game.lastRound[0];
    const picks = last
      ? `${sprite(moveOf(mySeat === "p1" ? last.p1Action : last.p2Action))}<b>VS</b>${sprite(moveOf(oppSeat === "p1" ? last.p1Action : last.p2Action))}`
      : `<span>NO ROUNDS YET</span>`;
    return `<div class="mini-board"><span>YOU ${scoreOf(game, mySeat)}</span>${picks}<span>${scoreOf(game, oppSeat)} RIVAL</span></div>`;
  },

  renderActions(game) {
    return movesFor(game)
      .map(
        (m, i) => `
        <button class="move-card" ${actionAttr({ [m.key]: null })} ${legal(game, m.key) ? "" : "disabled"} title="${esc(m.label)} [${i + 1}]">
          ${sprite(m.key)}<span class="move-label">${esc(m.label)}</span><span class="move-key">${i + 1}</span>
        </button>`
      )
      .join("");
  },

  // A hidden simultaneous pick changes nothing visible; the screen still
  // flips to "locked in" the moment the move is sent.
  applyLocal(game) {
    return game;
  },
};
