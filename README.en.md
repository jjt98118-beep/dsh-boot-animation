# dsh-moss-boot

A **boot animation** for DSH: a video plays full-frame over the app window — when
you open DSH, when you open a new conversation, or every time you open the
conversation you pinned.

**The built-in footage is themed on the Wandering Earth space station and the
quantum AI MOSS (550W)** — a red single eye ignites while the Earth's curve slides
past the viewport. All four clips ship embedded in the code, so they work the
moment you install, and you can swap in your own videos at any time.

> This is a modified version of
> [NativeDog1/dsh-boot-animation](https://github.com/NativeDog1/dsh-boot-animation)
> (BSD-3-Clause). See [LICENSE](LICENSE) and [CHANGELOG.md](CHANGELOG.md).

> 中文: [README.md](README.md)

- **Plays once every time you open DSH** (the third trigger — it can be switched off, see below)
- **Plays once per conversation** (the default for a new conversation)
- **Plays on every open for the conversation you pin** — one click on the pin in the sidebar footer
- **Sound on by default**, no click needed; the Fullscreen API is no longer called
- **Multi-clip rotation** — tick as many clips as you like and every play picks one
  at random, never the same one twice in a row
- **Full-frame**, skippable, closes itself when the clip ends
- **Bring your own clips** (three ways, below)



## What this is

A **boot intro** plugin. When you open DSH, open a new conversation, or open the
conversation you pinned, it plays a clip full-frame and closes itself when the
clip ends.

**The built-in footage is themed on the Wandering Earth space station and the
quantum AI MOSS (550W)** — a red single eye ignites while the Earth's curve
slides past the viewport. All four clips are embedded in the code, so they work
the moment you install it, and you can swap in your own videos at any time.

> The built-in clips are self-made recordings in that style, not material from
> the film, and this project is not affiliated with its rights holders.

## Install and update

### Inside DeepSeek Harness (recommended)

Open **Settings → Plugins → Add plugin**, paste this line into the box, and press
Install:

```
https://github.com/jjt98118-beep/dsh-moss-boot/releases/latest/download/dsh-moss-boot.tgz
```

> That box accepts **four** shapes: an npm package name, a GitHub repository URL, a
> tarball URL, or a local directory. This plugin is not published to npm, so **use the
> tarball link above** — a package name will not resolve. No git is needed either; the
> tarball is a finished build.

### From the command line

```sh
dsh plugin add https://github.com/jjt98118-beep/dsh-moss-boot/releases/latest/download/dsh-moss-boot.tgz
```

### Updating

**DSH does not update plugins automatically** (the install dialog says so as well):
run the install step again. The link uses `latest`, so it always resolves to the
newest release and the URL never changes.

> If it reports "already installed" instead of updating, that is because a plugin of
> the same name is already present — uninstall it in the plugin list first, then
> install again. See [CHANGELOG.md](CHANGELOG.md) for what changed.

## Usage

### Rotation (the mode you are in right now)

The videos **you** added to the clip library form a rotation pool, and **every
playback draws one at random** — you never have to name a clip:

- Same triggers as the new-conversation and pinned-conversation cases, and a new
  draw every time (opening DSH, entering a new conversation, entering the pinned
  conversation, clicking **▶ Preview now**)
- The pool is **your own videos** (whatever is in `videos/`) — and when you have
  added none, the four clips the package ships with
- Drop more videos into `videos/` later and they **join the rotation by
  themselves** — nothing to configure

**Tick entries in the clip library panel** — tick every clip you want in the
rotation:

- **1 clip ticked** = always play that one
- **Several ticked** = one of them at random per playback, and never the same clip twice in a row
- All ticked (the default) = they take turns
- The four built-in clips stay out of the rotation; clicking one says so

You can also edit `~/.dsh/boot-animation/selection.json` directly:

```json
{ "picked": [] }                              // every clip you added
{ "picked": ["clip-1a2b3c4d"] }               // only this one
{ "picked": ["clip-1a2b3c4d", "clip-2b.."] }  // one of these two, at random
```

The older `{"id": "..."}` / `{"random": true}` shapes are still read.

> How it works: on each playback the browser appends a **fresh play id** to the
> video URL (`boot.mp4?p=…`), and the host resolves that id to a random clip and
> **remembers it**. That way every Range request belonging to one playback lands
> on the same clip — a file stitched from two clips reports no error at all, it
> simply never paints a frame — and the rotation **never plays the same clip
> twice in a row**.

For diagnosis, `~/.dsh/boot-animation/access.log` gets one line per playback
(request path, play id, and which clip was actually served).

### Plays automatically in a new conversation

Opening a conversation you have not said anything in yet plays the intro once.

### Plays once when you open DSH

As soon as DSH is open (the page has loaded), the intro plays once — **without
entering any conversation**. This is the third trigger this plugin adds; the
original two (once per new conversation, every open of a pinned conversation) are
untouched.

If you would rather not have it on every start, switch it off from the browser
console:

```js
localStorage.setItem('dsh-moss-boot:boot', 'off')
```

To turn it back on: `localStorage.removeItem('dsh-moss-boot:boot')`.

> The switch lives in browser storage, so — like the pin — it is per browser.

### Replay on every open in one conversation (recommended)

1. Open that conversation
2. Click the **🎞** icon at the bottom of the sidebar (right next to Settings)
3. The icon turns green **🎬** — it is pinned

From then on **every** entry into that conversation replays the intro: switching
away and back, or reloading the page, both replay it.

Click the icon again to unpin.

> Note: if your active main panel at startup is not a conversation (a plugin
> panel, say), there is no current conversation yet and the pin is disabled. Open
> a conversation first.

## Bring your own video (the clip library)

This plugin is a **library**, not a single slot: it lists every video it can
find, you pick one, and the choice is remembered.

### Four clips ship with the plugin (embedded in the code)

Nothing to add after installing — the library already offers four clips:

| Name in the library | Source | Size |
|---|---|---|
| `片头 1` (intro1) | embedded in `lib/clips.data.js` | 443 KB |
| `片头 2` (intro2) | embedded in `lib/clips.data.js` | 1.11 MB |
| `片头 3` (intro3) | embedded in `lib/clips.data.js` | 1.11 MB |
| `片头 4` (intro4) | embedded in `lib/clips.data.js` | 5.08 MB |

**There are no mp4 files on disk for these** — they are stored as base64 in
`lib/clips.data.js`, and the host imports that module only when an embedded clip
is first requested (it is a ~10.3 MB module; parsing it at startup would make
every DSH launch pay for it). The point of embedding them is that nothing can go
missing: no `files` entry to forget, no stale copy in an install, no broken
container shipped. `media/*.mp4` is only the input to
`npm run embed-clips` and is **not published**.

**Faststart status, clip by clip.** Three of the four keep their index (`moov`) at
the head of the file, so they play while still downloading. **The first clip keeps
its index at the end.** The embed script used to refuse such an input outright;
here it warns and embeds it anyway, because an embedded clip is served from memory
over loopback — the whole file arrives at once, so a trailing index costs nothing
on that path. To distribute the same file as an ordinary download, remux it first:

```sh
ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4
```

A trailing index does matter for a plain download: the file must arrive in full
before a single frame appears, which with the client's 25-second watchdog looks
exactly like "the intro is a black screen".

Size: the tarball is **7.6 MB**, about **11 MB** unpacked. **Only the fourth clip
was re-encoded** — it was 6625 kbps, 16 seconds, 12.65 MB, and became 5.08 MB at
**CRF 23**, measuring **SSIM 0.9916 / PSNR 47.5 dB**. The bar for "cannot be told
apart in practice" is SSIM >= 0.99 and PSNR >= 40 dB. **The first three are
untouched**: they already sit at 322–830 kbps, so re-encoding them would cost real
detail to save almost nothing, and together they weigh 2.65 MB. The source footage
is not in this repository.

To swap in your own clips: put the mp4 files in `media/`, edit the manifest in
`scripts/embed-clips.mjs`, and run `npm run embed-clips`. (For a quick trial you
do not need any of that — see "The easy way" below.)

### The easy way (recommended)

1. Drop the mp4 into `~/.dsh/boot-animation/videos/`
2. Click **🎛** at the sidebar foot (next to the 🎞 pin) to open the clip library
3. Tick the entry you want to play

The clip you ticked shows up on the **next** playback: a new conversation, or a
conversation you pinned.

> On Windows that folder is `C:\Users\<you>\.dsh\boot-animation\videos\`.
> The exact path is the one printed at the bottom of the library panel.
>
> You do not have to delete anything to keep things "clean": **when the same
> video exists in several places the library lists it once** (identity is the
> file's content hash, cached per size+mtime) and labels it "merged N duplicates".
> Your files stay exactly where they are, they are just not listed twice. This
> fixes a real confusion from the past: a user had their own `intro.mp4` as well,
> so the same clip appeared twice in the panel under two different badges and it
> looked as if "this clip is not in the plugin".

### The library panel

The panel's own labels are Chinese; here is what each element does:

| Element | What it does |
|---|---|
| ✓ mark | the clip currently in effect (ticked) |
| Source badge | `你自己加的` (yours) / `插件内置` (bundled) / `环境变量` (from an environment variable) |
| File size | helps you confirm you swapped in the right file |
| **▶ 预览当前** (Preview now) | **plays the selected clip immediately**, without waiting for the next trigger (see below) |
| 刷新 (Refresh) | rescan after dropping a file into the folder |
| `原片源` badge | the historical `intro.mp4` drop-in, still preferred |
| ⚠ 未优化 badge | this file's index (`moov`) is at the end; remux it (see below) |
| `铺满屏幕` / `完整显示` | how the clip is fitted to the window, see below |

### Swapped a clip and "nothing happened"? Click "Preview now" first

The intro has three triggers:

- **Opening DSH** — plays once per page load, so a plain reload replays it
  (unless you switched that trigger off)
- **New conversation** — plays **once** (the conversation is remembered, so it
  never nags twice)
- **Pinned conversation** — plays on every open

In **rotation** mode a clip is picked again on every play, so seeing a different
one next time is expected rather than a bug. **▶ Preview now** in the library runs
the current rotation right away, so you can confirm a change landed without
waiting for a trigger. To check what a play actually resolved to, read
`$DSH_HOME/boot-animation/access.log` — one line per playback.

### How the clip is fitted to the window (the black-bar question)

The overlay covers the whole window, but **the window's aspect ratio is almost
never the video's** — the browser has a title bar and toolbars, so the viewport
is usually wider than 16:9. Hence:

| Mode | CSS | Effect |
|---|---|---|
| **铺满屏幕** — fill the screen (default) | `object-fit: cover` | fills the window, **no black bars**, the overflow is cropped |
| 完整显示 — show the whole frame | `object-fit: contain` | every frame is visible, **black bars** whenever the aspect ratios differ |

Switch it in the library panel; it takes effect on the **next** playback. Choose
"show the whole frame" when the clip carries subtitles, a logo or a watermark
close to the edge that you do not want cropped.

> If the black bars are **burned into the video itself** (baked in at export
> time), CSS cannot help; crop them with ffmpeg:
> `ffmpeg -i in.mp4 -vf "crop=W:H:X:Y" -c:a copy out.mp4`.
> To tell which case you are in, run
> `ffmpeg -v info -i in.mp4 -vf cropdetect=24:16:0 -f null -`: if the reported
> `crop=` value stays constant for the whole clip it is baked in, and if it keeps
> changing it is just dark background — do not crop.

### Supported formats

`.mp4` `.m4v` `.webm` `.mov` `.mkv` — but **whether a file plays depends on the
browser's decoder**. H.264 + AAC in mp4 is the safest bet; HEVC (H.265), ProRes
and some mkv files will most likely give you audio only, or a black screen.

### The manual way (the old approach, still supported)

The host resolves in this order and **re-resolves on every request** (so swapping
a clip needs no restart):

| Order | Location |
|---|---|
| 1 | the id picked in `~/.dsh/boot-animation/selection.json` (written by the library panel) |
| 2 | the file named by the `DSH_BOOT_ANIMATION` environment variable |
| 3 | `~/.dsh/boot-animation/intro.mp4` (the historical drop-in, still preferred over the other library files) |
| 4 | the most recently modified file in `~/.dsh/boot-animation/videos/` |
| 5 | **the four embedded clips** (in the order of `scripts/embed-clips.mjs`) — always a last resort, because they live in the code |

So the most reliable manual swap is still:

```sh
mkdir -p ~/.dsh/boot-animation
cp my-intro.mp4 ~/.dsh/boot-animation/intro.mp4
```

To check what is in use right now, hit the status endpoints:

```sh
curl http://127.0.0.1:3080/dsh-moss-boot/status.json
curl http://127.0.0.1:3080/dsh-moss-boot/videos.json
```

### Troubleshooting: black video / it disappears mid-play

**Nine times out of ten the container is not faststart.** If an mp4 has its index
(`moov`) at the end of the file, the browser has to download **the whole thing**
before it can decode anything and the screen stays black until then — and the
client has a **25-second watchdog** (`STALL_TIMEOUT_MS`) that closes the overlay
on timeout. The symptom is "I clicked and got nothing".

Remux the container with ffmpeg (**lossless**, no re-encode):

```sh
ffmpeg -i original.mp4 -c copy -movflags +faststart fixed.mp4
```

To verify that `moov` is up front:

```sh
ffprobe -v trace fixed.mp4 2>&1 | grep -m1 moov   # the offset should be small
```

## Sound and fullscreen

**Sound is automatic — normally you never click anything.** The intro starts
**with audio**:

- In the **DSH desktop app** (the Electron shell) an unmuted autoplay is allowed,
  so there is sound from the first frame
- In a **plain browser tab**, the browser may refuse "autoplay with sound". The
  plugin then **falls back to a muted play automatically**, so the picture still
  appears, and shows "点击开启声音" (click for sound) at the bottom — one click on
  the picture brings the audio in. This is a browser-level policy; no web page can
  get around it

**The Fullscreen API is no longer called.** The overlay already covers the whole
window (visually fullscreen), and real fullscreen needs a user gesture just the
same — so it was removed, and with it the old "click once to go truly fullscreen"
behaviour.

In the rare case that even the **muted** autoplay is refused, you get a "点击播放"
(click to play) state instead of a black screen.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Nothing appears at all | Almost always caching: **Ctrl+Shift+R**, or restart the DSH service once |
| Did not play when DSH opened | First check it was not switched off: run `localStorage.getItem('dsh-moss-boot:boot')` in the console — `off` means it was |
| A new conversation does not play | That conversation already played it (once per conversation). Pin it to make it play every time |
| Pinned, but still nothing | Check the pin is green, and that you really opened the pinned conversation |
| Black screen, no picture | Check `moov` is up front (see "Troubleshooting: black video" above); then open `/dsh-moss-boot/status.json` to see the source; finally check the browser console for a decode error |
| A swapped clip did not take effect | In the library, the entry needs a ✓ to be in effect; make sure the file is in `videos/` and that you pressed Refresh |
| It disappears mid-play | The 25-second watchdog (`STALL_TIMEOUT_MS`) fired — usually still faststart, or slow decoding |
| Want to see what the plugin is doing | Set `DEBUG = true` at the top of `src/client/index.ts` and rebuild; the console then logs every decision |

## Implementation notes (for maintainers)

- Seats: `shell.overlay` (frame-wide floating layer, `kind: list`, so a new cell
  never replaces official UI) + `sidebar.footer.action` (the pin and the 🎛
  library entry at the sidebar foot)
- The current conversation comes from `ctx.uiSession.adapter.current`, a
  React-friendly store. **Its snapshot is not a session record** but the resolved
  descriptor output `{ key, hooks, keyedHooks, props }` — the session id is at
  `props.sessionId`, the session snapshot at `hooks.session`
- The "this is a brand new conversation" field is **`blankBit`**
  (`hooks.session.blankBit`). `session.blank` belongs to another package's
  projected object and is not on this snapshot
- "Replay on every open" is implemented by watching **entry into** a conversation
  rather than remembering whether it played, so a pinned conversation ignores the
  seen list
- "Play when DSH opens" is **triggered once on mount**. `bootPlayed` is a
  module-level flag rather than a ref: opening the library dialog unmounts the
  whole overlay tree, and a ref would replay the intro every time the library was
  closed
- The video route honours **Range** (browsers send Range for media, and some
  players refuse to play when a 200 arrives where a 206 was expected)
- Media responses use **`no-cache` + ETag, not `no-store`**: `no-store` forbids
  the browser to keep a single byte, so **every intro re-downloaded the whole
  clip** and the screen was black while it did. `no-cache` means "keep it, but ask
  first", and with the ETag: unchanged clip → 304 and playback starts from the
  local copy (instant); changed clip → different ETag → fresh bytes.
  `verify-routes.mjs` asserts exactly this, including the counter-case "a request
  carrying the old ETag for a new clip must answer 200"
- **Hooks can only be called inside a component**: `apply()` is called by the
  plugin loader, not by React, so all state lives inside the `AppRoot` component.
  The library entry sits in the pin's slot and the dialog in the overlay's slot —
  two independent React roots, bridged by the module-level `libraryOpeners`
  subscriber set
- Library routes: `videos.json` (list), `media/<id>` (stream by id), `select`
  (POST to write the selection), `boot.mp4` (the old route, serving the clip
  currently in effect — kept for backwards compatibility)
- Embedded clips have ids of the form `builtin:<name>`, which can never collide
  with a path-derived id; their ETag is the clip's own content hash
  (`"embedded-<first 16 of sha256>"`), so revalidation is exact and does not
  depend on `stat`
- **The same video in several locations is de-duplicated by content** (sha256;
  for files the hash result is cached against size+mtime), and the embedded copy
  wins — it cannot be deleted, so a selection pointing at it always resolves
- **Prefix routes must not carry a trailing slash**: the webserver matches with
  `pathname !== prefix && !pathname.startsWith(prefix + '/')`, so registering
  `.../media/` would be tested as `.../media//` and never match (this once made
  every `/media/<id>` 404)
- The **rotation route `boot.mp4` answers `cache-control: no-store`** and the list
  endpoint **no longer returns the `activeVersion` fingerprint**: the browser used
  to append that hash as `?v=<hash>` and cache the URL for a year, so the rotation
  was never asked again and every play showed the same clip. Without the
  fingerprint the browser must ask every time
- Random selection happens **on the server**, keyed by the play id
  (`boot.mp4?p=…`), so one playback's Range requests all resolve to the same clip.
  A browser half with no play id (an old cached bundle) is served by a stable
  choice held for a **20-second window**, so one playback is still not split;
  only after the window expires is a new clip drawn. Per-clip
  `/media/<id>?v=<hash>` URLs are genuinely content-addressed and do keep their
  fingerprint (and may be cached forever)

## Verification scripts (run these after a change)

| Command | What it does |
|---|---|
| `npm run verify:routes` | drives the real handlers with **the server's own matching rules** and asserts every route |
| `npm run verify:letterbox` | drives local Edge over CDP and measures how much letterboxing the chosen fit mode actually leaves |
| `npm run check` | the CSS-template backtick check plus route verification |
| `npm run build:client` | runs the CSS check first, then builds (so a broken template cannot be built) |

Both verification scripts were forced into existence by real bugs, and each has
had its lesson in "testing itself with its own rules": their assertions
deliberately replicate the rules of the code under test, and before committing
they get a **reverse check** (break it on purpose → it must fail).

> There is a trap in the client build: the whole stylesheet is one template
> string, so a single backtick in a comment ends it early — and the error you get
> is a **TypeScript parse error pointing at some line of CSS**, while
> `lib/client.js` stays unchanged, so it looks as if the change worked when it did
> not. `scripts/check-css-template.mjs` exists to catch exactly that, and it is
> wired into `build:client`.

## License

BSD-3-Clause, see [LICENSE](LICENSE). The media the package distributes — the four
clips embedded in `lib/clips.data.js` — ships under the same terms.
