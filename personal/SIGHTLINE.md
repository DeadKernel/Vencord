# Sightline in Accord: Go Live that feels like Discord's

Decided 2026-11-06 (Aditya): a room per voice channel, Rich Presence, and watching inside the call
view. Goal: starting and watching a Sightline stream works where Discord's own Go Live does, and looks
like it, while the video never touches Discord.

## What it feels like

- **Going live.** In a voice channel, the voice panel has a Sightline Go Live button next to Discord's
  screen-share button. It opens a picker in Discord's style (Screens / Applications, thumbnails, the
  name under each), then goes live into that channel's Sightline room. While live: the button shows
  LIVE; its menu changes what's shared (no stop), copies the watch link, saves a clip, stops.
- **Seeing who's live.** Members of the voice channel who are live on Sightline get Discord's red
  LIVE pill in the voice member list (ours in the sidebar first, Discord's own list after).
- **Watching.** Clicking the pill (or Watch in the member's menu) opens the stream in the call view's
  stage, like a Discord stream: the viewer page in a frame of its own process, sized to the stage, with
  fullscreen and pop-out (pop-out = today's viewer window). Closing it returns to the call.
- **Friends on stock Discord.** Rich Presence ("Streaming on Sightline", a Watch button that opens the
  browser viewer). Phase 2: needs a Discord application id.

## How the pieces talk

- **Room per voice channel.** `dk-` + the first 16 hex of SHA-256(`sightline-room:` + channel id).
  Computed in Accord for both going live and watching; no channel id leaves the client.
- **Who is whom.** Going live from Accord passes the Discord user id to Sightline; the app's room
  presence (`hang/user.json`) carries `discord: "<user id>"`. A viewer in the room maps members to
  Discord users by it.
- **Sightline app bridge** (`app/src-tauri/src/bridge.rs`): `goLive {source?, room?, discord?}` joins
  `room` (keeping the name) before going live and puts `discord` in presence; `switch`, `stop` as now.
- **Viewer embed mode** (`sightline.padwal.dev/r/<room>?embed=1`): no join form (name from `?name=` or
  the one it remembers, else "Accord"), no page chrome, `?focus=<discord id>` puts that member's stream on
  the stage. `?lobby=1`: room presence only, no video. Talks to its parent by `postMessage`:
  - out: `{type: "sightline:members", members: [{id, name, discord?, live}]}` on every change;
    `{type: "sightline:ready"}`.
  - in: `{type: "sightline:focus", discord}`, `{type: "sightline:leave"}`.
  Messages are accepted only from the embedding origin it was given (`?parent=`), and only Accord's
  Discord origins.
- **Accord** (`src/deadkernel/sightline/`): while in a voice channel, a hidden lobby frame for that
  channel's room feeds the LIVE pills; Watch mounts the embed frame over the call stage. Discord's CSP
  gets the viewer origin for `frame-src` only.

## Order

1. Bridge: `goLive {room, discord}`, presence carries `discord`. 2. Viewer embed + lobby modes.
3. Accord: voice-panel button + picker, lobby + pills in our sidebar, stage frame. 4. Discord's own
member list pills, Rich Presence (needs the application id).
