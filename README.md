# RPS Arcade

A retro arcade frontend for the **Rock-Paper-Scissors** game on the
Internet Computer: synthwave grid, pixel font and sprites, a CRT filter,
8-bit sound effects, and a big **READY? → FIGHT! → K.O.** reveal for
every round.

It is only a page. The game's backend is somebody else's and already
live; this page talks to it, so players here meet players on the
original frontend (https://gaiov-caaaa-aaaac-bga5q-cai.icp.net) at the
same tables.

|                     |                                                                  |
| ------------------- | ---------------------------------------------------------------- |
| Backend canister    | `ghjib-pyaaa-aaaac-bga5a-cai`                                    |
| Required variable   | `PUBLIC_CANISTER_ID:backend=ghjib-pyaaa-aaaac-bga5a-cai`         |
| Rules (spec)        | https://ghjib-pyaaa-aaaac-bga5a-cai.raw.icp0.io/semantics        |
| Client library      | [`@research-ag/duel-game-core`](https://www.npmjs.com/package/@research-ag/duel-game-core) (npm) |

## Build

Needs Node.js 20 or newer.

```bash
cd frontend
npm install
npm run build          # -> frontend/dist/
```

`frontend/dist/` is the whole site: `index.html`, `app.js` (everything
bundled by esbuild), `style.css`, the pixel font and the favicon.

## Run it locally

Serve `dist/` with any static web server, for example:

```bash
cd frontend
npx serve dist -l 5173          # or: python3 -m http.server 5173 --directory dist
```

Then open http://localhost:5173/. Open a second tab to play the other
seat: each tab is its own anonymous player.

A page served like this has no `ic_env` cookie, so it falls back to the
backend id hardcoded in `frontend/src/app.js` (`BACKEND`), which is the
live game. **It plays on the real tables**, so when testing, create
tables with an access code (ACCESS → CODE), never open ones, and leave
them when done.

## Put it online (hosty.live)

1. Build and zip, from `frontend/`:

   ```bash
   npm run build && zip -r dist.zip dist -x "*.map"
   ```

2. In https://hosty.live/ (sign in with Internet Identity), create a
   **Frontend** canister, or use one you already have.
3. On the canister's page → **Canister environment variables** → **Add
   variable**:
   - name: `PUBLIC_CANISTER_ID:backend` (the colon is part of the name)
   - value: `ghjib-pyaaa-aaaac-bga5a-cai`

   → **Save and publish**.
4. **Deploy** → **ZIP Upload**: pick `dist.zip`, switch on the
   already-built option (no build on the server), output directory
   `dist`, deploy.
5. Open the canister's URL and play a round from two tabs.

Every later version is the same build, zip and upload into the same
canister. The variable stays.

An AI agent with hosty.live's MCP server connected can do steps 3–4
with `hosty_prepare_zip_upload { canisterId, pureAssets: true,
outputDir: "dist", canisterEnv: { set: { "PUBLIC_CANISTER_ID:backend":
"ghjib-pyaaa-aaaac-bga5a-cai" } } }`, then `hosty_wait_for_deployment`.

Optionally, list the page on the Duel dashboard
(https://n6plc-4yaaa-aaaaj-qshia-cai.icp.net/) by its canister id.

## How the page finds its backend

`frontend/src/app.js`:

- `PUBLIC_CANISTER_ID:backend` from the `ic_env` cookie when the page's
  canister publishes it (the live page, once step 3 above is done);
- otherwise the constant `BACKEND = "ghjib-pyaaa-aaaac-bga5a-cai"`.

The agent always talks to mainnet through `https://icp0.io`, whatever
the page's own address. Only a page served by a local replica (cookie
present, `localhost` host) uses that replica and its root key.

## Playing

- **NEW GAME**: pick your seat (1P/2P), the mode (CLASSIC, or +WELL
  with the fourth symbol), first to 1–9 round wins, and OPEN or CODE
  access. **ARCADE FLOOR** lists open tables to join.
- **VS CPU** appears when the backend has registered bots. CPU tables
  always get a random access code.
- **COPY INVITE LINK** on the waiting screen gives a link that joins
  your table directly (`#join=<table>&seat=<p1|p2>&code=<code>`).
- Keys: **1–4** or **R/P/S/W** pick a move, **Enter** rematch on the
  result screen, **M** sound on/off, **C** CRT filter on/off.
- **HI-SCORES** shows the backend's leaderboard (ELO).

Rules, from the backend: scissors beats paper, paper beats rock, rock
beats scissors; in +WELL, well beats rock and scissors and paper beats
well. A tie scores nobody. First to the target takes the match.

## Project layout

```
backend.did              the live backend's Candid (from hosty.live's module store), for reference
frontend/
  package.json  build.js
  src/
    index.html           page shell: background, CRT overlay, dialogs
    app.js               bootstrap: backend id, agent, transport, client, CPU flow, hi-scores
    arcade-ui.js         every screen, the arena, the READY?/FIGHT! reveal, clocks
    rps-plugin.js        the GamePlugin: Candid types and rules mirror
    sprites.js           16x16 pixel-art sprites (rock, paper, scissors, well, ?)
    sfx.js               8-bit sound effects, synthesised with WebAudio
    style.css            synthwave look, CRT filter, animations
    favicon.svg
```

The wire protocol is entirely `@research-ag/duel-game-core`'s headless
client (`createDuelClient`). This project only draws on top of it.
