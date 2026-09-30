/**
 * @dsh-external/dsh-boot-animation - browser half.
 *
 * Plays the boot video full-frame in three cases:
 *   1. opening DSH itself, once per page load (the `dsh-boot-animation:boot`
 *      switch turns this trigger off);
 *   2. the conversation the user PINNED as their intro session, EVERY time it is
 *      opened (that is the "professional work mode" conversation they return to);
 *   3. a brand new, still-empty conversation, once per conversation.
 *
 * The pin exists because a specific conversation cannot be identified by name
 * from the client: session titles are not part of the session summary the client
 * holds, and asking a human for a session UUID is not a workflow. So the sidebar
 * footer gets one small button that pins whatever conversation is open.
 *
 * Seating:
 *   - `shell.overlay`        the frame-wide floating layer for the animation
 *   - `sidebar.footer.action` the small pin toggle beside Settings
 * Both are list slots, so each is an added cell, never a replacement.
 *
 * Which session is current comes from the ui-session service. Its
 * `adapter.current` store resolves to `{ key, hooks, keyedHooks, props }`, i.e.
 * `props.sessionId` and `hooks.session`. A brand new conversation is
 * `hooks.session.blankBit === true` (`blank` belongs to another package's
 * projected summary and is not on this snapshot).
 *
 * Browser policy, honestly: audio autoplay requires a user gesture in a plain
 * browser tab. The overlay therefore tries an UNMUTED play first — the desktop
 * shell DSH runs in allows it, so there is sound from the first frame with no
 * click — and falls back to a muted play plus a "click to unmute" hint only when
 * the browser refuses. The Fullscreen API is not used at all: the overlay already
 * covers the window, and it would need the same gesture anyway.
 */

import type { ReactElement } from 'react'
import { createElement as h, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** Slot service for both seats, ui-session for the current conversation. */
export const inject = ['slots', 'uiSession']

/**
 * Plays the active clip.
 *
 * The src is a CONSTANT. It used to carry `#<activeId>` so the element would
 * reload when the library selection changed, but the id arrives from an async
 * fetch, so the src changed a moment AFTER the overlay opened — mid-playback.
 * A src change restarts the media load, and the play() effect does not re-run
 * on it, so the result was a black frame that looked like "the video will not
 * load". The fragment bought nothing: the route resolves the active file on
 * every request, so the next time the overlay opens it is already the new clip.
 */
const VIDEO_URL = '/dsh-boot-animation/boot.mp4'
const MEDIA_URL = '/dsh-boot-animation/media'
const LIST_URL = '/dsh-boot-animation/videos.json'
const SELECT_URL = '/dsh-boot-animation/select'
const SEEN_KEY = 'dsh-boot-animation:seen'
const PIN_KEY = 'dsh-boot-animation:pinned'
const FIT_KEY = 'dsh-boot-animation:fit'
const BOOT_KEY = 'dsh-boot-animation:boot'
const MAX_SEEN = 80
/** Never let a stalled video trap the user behind the overlay. */
const STALL_TIMEOUT_MS = 25000

/**
 * The clip's content key, fetched once so the media URL can carry `?v=`.
 *
 * The route is constant but the BYTES behind it are not: this session alone
 * served three different files under `/boot.mp4`. A media cache keyed by that
 * URL, revalidating range requests one at a time, can end up holding a spliced
 * file — and a spliced MP4 does not error, it simply never paints. Pinning the
 * content key into the URL gives every distinct clip its own cache entry, so a
 * stale one cannot exist, and lets the host answer `immutable` rather than
 * `no-cache` (which is what makes the NEXT play instant instead of a round trip).
 *
 * Resolved BEFORE any overlay opens and never during playback: a src that
 * changes after mount restarts the media load while the play() effect does not
 * re-run, which is the black frame this plugin already fixed once.
 */
let activeVersion: string | null = null
let versionStarted = false

/**
 * Whether the host is rotating through the clips the user added.
 *
 * The BROWSER does not pick the clip. It appends a fresh play id to the video
 * URL, and the host resolves that id to a random clip and remembers it, so every
 * Range request of one playback gets the same file. The choice thus lives on one
 * side, and the client cannot get it wrong.
 */
let randomMode = false

/** Resolves once the clip list has arrived, so the very first play can be random. */
let libraryReady: Promise<void> = Promise.resolve()

/**
 * A URL unique to this one playback.
 *
 * The suffix must change every time: it is the id the host keys the random
 * choice on, and reusing one would replay the clip it already picked.
 */
function playSrc(): string {
  return VIDEO_URL + '?p=' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Run `fn` once the clip list is known — the boot play needs the mode. */
function whenLibraryReady(fn: () => void): void {
  void libraryReady.then(() => fn())
}

function resolveActiveVersion(): void {
  if (versionStarted) return
  versionStarted = true
  libraryReady = (async () => {
    try {
      const response = await fetch(LIST_URL, { cache: 'no-store' })
      if (!response.ok) return
      const data = (await response.json()) as {
        activeVersion?: unknown
        random?: unknown
        randomPool?: unknown
      }
      const version = data.activeVersion
      if (typeof version === 'string' && version !== '') {
        activeVersion = version
        log('active version', version)
      }
      // Only the flag is read here: the pool lives on the host, which turns a
      // play id into a clip. It is assigned both ways, because a stale flag
      // would keep overriding the clip the user just pinned.
      randomMode = data.random === true
      log('random mode', randomMode)
      // Warm the caches while nobody is waiting: the plain route, which the
      // host answers with a real clip, and the clip list itself.
      const first = VIDEO_URL
      await fetch(first, { cache: 'no-store' })
      notify('media prefetched', first)
    } catch (error: unknown) {
      notify('prefetch failed', String(error))
    }
  })()
}

/** The URL to play, carrying the content key when it is already known. */
function videoSrc(): string {
  return activeVersion === null ? VIDEO_URL : VIDEO_URL + '?v=' + encodeURIComponent(activeVersion)
}

/**
 * How the clip meets the window: 'cover' fills it and crops the overflow,
 * 'contain' shows the whole frame and leaves black bars. Cover by default,
 * because a splash that leaves bars on a normal monitor reads as broken.
 * Read per overlay open, like the clip choice, so a change lands next playback.
 */
type Fit = 'cover' | 'contain'
function readFit(): Fit {
  try {
    return window.localStorage.getItem(FIT_KEY) === 'contain' ? 'contain' : 'cover'
  } catch {
    return 'cover'
  }
}
function writeFit(fit: Fit): void {
  try {
    window.localStorage.setItem(FIT_KEY, fit)
  } catch {
    /* private mode: it simply does not persist */
  }
}

/** Set to true to narrate every decision the plugin makes in the browser console. */
const DEBUG = false
function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      }
      return String(a)
    })
    .join(' ')
}
function narrate(text: string): void {
  try {
    console.log('[dsh-boot-animation] ' + text)
  } catch {
    /* console unavailable */
  }
}
function log(...args: unknown[]): void {
  if (!DEBUG) return
  narrate(formatArgs(args))
}

/**
 * The always-on subset. A black overlay reports nothing by itself — no network
 * error, no thrown exception, just a video element that never paints — so the
 * four things needed to diagnose one from the outside are logged unconditionally:
 * which URL the element actually used, when the first frame arrived, when the
 * element errored and with which code, and when the stall watchdog gave up.
 * They are one line each and only fire on a play, so the noise is bounded.
 */
function notify(...args: unknown[]): void {
  narrate(formatArgs(args))
}

function readSeen(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

function hasPlayed(sessionId: string): boolean {
  return readSeen().includes(sessionId)
}

function markPlayed(sessionId: string): void {
  try {
    const seen = readSeen()
    if (!seen.includes(sessionId)) seen.push(sessionId)
    while (seen.length > MAX_SEEN) seen.shift()
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    /* private mode: it simply replays next time */
  }
}

function readPinned(): string | null {
  try {
    const value = window.localStorage.getItem(PIN_KEY)
    return value === null || value === '' ? null : value
  } catch {
    return null
  }
}

function writePinned(sessionId: string | null): void {
  try {
    if (sessionId === null) window.localStorage.removeItem(PIN_KEY)
    else window.localStorage.setItem(PIN_KEY, sessionId)
  } catch {
    /* private mode: the pin simply does not persist */
  }
}

/**
 * Whether the intro also plays once when DSH itself is opened.
 *
 * Off only when explicitly switched off, so the animation keeps running for
 * everyone who never touches it.
 */
function readBootOn(): boolean {
  try {
    return window.localStorage.getItem(BOOT_KEY) !== 'off'
  } catch {
    return true
  }
}

/**
 * Fired once per page load, not once per overlay mount: AppRoot unmounts while
 * the clip library is open, so a mount-scoped flag would replay the intro every
 * time that dialog was closed.
 */
let bootPlayed = false

const STYLE_ID = 'dsh-boot-animation-style'
const CSS = `
.dba-root{position:fixed;inset:0;z-index:2147483000;background:#000;
  display:flex;align-items:center;justify-content:center;
  pointer-events:auto;cursor:pointer;overflow:hidden}
.dba-video{width:100%;height:100%;object-fit:contain;background:#000;display:block}
/* The ONLY difference between the fit modes is object-fit.
   Do not "harden" this with position/inset changes: the bar fix does not need
   them, and an overlay that rendered correctly under flex + percentage sizing
   went fully black in the real app the one time the layout mechanics were
   rewritten for no reason. Minimal change, or you trade a cosmetic defect for
   a functional one.
   NOTE: never put a backtick in this block — the whole sheet is a template
   literal, and one backtick ends it. scripts/check-css-template.mjs enforces it. */
.dba-video.dba-cover{object-fit:cover;object-position:center}
.dba-skip{position:absolute;top:20px;right:22px;z-index:2;
  border:1px solid rgba(255,255,255,.42);background:rgba(0,0,0,.42);
  color:#fff;border-radius:999px;padding:6px 16px;font-size:13px;line-height:1.4;
  font-family:inherit;cursor:pointer;
  opacity:0;pointer-events:none;transition:opacity .3s ease}
.dba-skip.dba-skip-on{opacity:1;pointer-events:auto}
.dba-skip:hover{background:rgba(0,0,0,.66)}
.dba-hint{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);
  z-index:2;color:rgba(255,255,255,.82);font-size:13px;letter-spacing:.06em;
  font-family:inherit;text-shadow:0 1px 8px rgba(0,0,0,.9);
  animation:dba-breathe 2.4s ease-in-out infinite;white-space:nowrap}
@keyframes dba-breathe{0%,100%{opacity:.55}50%{opacity:1}}
.dba-status{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  z-index:2;color:rgba(255,255,255,.88);font-size:14px;letter-spacing:.04em;
  font-family:inherit;text-align:center;max-width:78vw;
  background:rgba(0,0,0,.46);border-radius:10px;padding:10px 18px;
  text-shadow:0 1px 10px rgba(0,0,0,.9)}
.dba-pin{display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;padding:0;border:0;border-radius:8px;cursor:pointer;
  background:transparent;color:var(--dsw-alias-text-secondary,#888);
  font-size:14px;line-height:1;font-family:inherit}
.dba-pin:hover{background:rgba(127,127,127,.16);color:var(--dsw-alias-text-primary,#191919)}
.dba-pin.dba-pin-on{color:#07c160;background:rgba(7,193,96,.14)}
.dba-veil{position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,.46);
  display:flex;align-items:center;justify-content:center;padding:24px}
.dba-lib{width:min(560px,100%);max-height:min(76vh,640px);overflow:auto;
  background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-text-primary,#191919);
  border:1px solid rgba(127,127,127,.28);border-radius:14px;padding:18px 18px 14px;
  box-shadow:0 18px 60px rgba(0,0,0,.34);font-family:inherit;
  font-size:13px;line-height:1.55}
.dba-lib h3{margin:0 0 4px;font-size:15px;font-weight:600}
.dba-lib p{margin:0 0 12px;color:var(--dsw-alias-text-secondary,#777);font-size:12.5px}
.dba-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;
  cursor:pointer;border:1px solid transparent}
.dba-item:hover{background:rgba(127,127,127,.12)}
.dba-item.dba-cur{border-color:rgba(7,193,96,.55);background:rgba(7,193,96,.10)}
.dba-item .dba-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dba-badge{font-size:11px;padding:1px 7px;border-radius:999px;
  background:rgba(127,127,127,.18);color:var(--dsw-alias-text-secondary,#777);white-space:nowrap}
.dba-badge.dba-b-sel{background:rgba(7,193,96,.16);color:#07974b}
.dba-badge.dba-b-warn{background:rgba(210,120,40,.18);color:#b46214;cursor:help}
.dba-meta{font-size:11.5px;color:var(--dsw-alias-text-secondary,#999);white-space:nowrap}
.dba-mark{width:16px;text-align:center;color:#07c160;font-weight:700}
.dba-dir{margin:12px 0 0;padding:9px 10px;border-radius:9px;background:rgba(127,127,127,.10);
  font-size:11.5px;color:var(--dsw-alias-text-secondary,#777);word-break:break-all}
.dba-dir code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;
  color:var(--dsw-alias-text-primary,#333)}
.dba-bar{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.dba-fit{display:flex;align-items:center;gap:8px;margin-top:12px;
  font-size:12px;color:var(--dsw-alias-text-secondary,#777)}
.dba-btn.dba-btn-on{border-color:rgba(7,193,96,.6);background:rgba(7,193,96,.12);color:#07974b}
.dba-btn.dba-btn-preview{border-color:rgba(7,193,96,.55);color:#07974b;font-weight:600}
.dba-btn.dba-btn-preview:hover{background:rgba(7,193,96,.12)}
.dba-btn{border:1px solid rgba(127,127,127,.34);background:transparent;color:inherit;
  border-radius:8px;padding:5px 14px;font-size:12.5px;font-family:inherit;cursor:pointer}
.dba-btn:hover{background:rgba(127,127,127,.14)}
.dba-msg{margin-top:10px;font-size:12px;min-height:16px;color:var(--dsw-alias-text-secondary,#777)}
.dba-msg.dba-ok{color:#07974b}
.dba-msg.dba-err{color:#d24a43}
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

type CurrentStore = {
  getSnapshot: () => unknown
  subscribe: (listener: () => void) => () => void
}

/** Resolved ui-session binding as the built-in source publishes it. */
type Binding = {
  key?: unknown
  hooks?: {
    session?: {
      /** The snapshot's own "this conversation is still empty" flag. */
      blankBit?: unknown
    }
  }
  keyedHooks?: unknown
  props?: { sessionId?: unknown }
}

const noopSubscribe = () => () => {}

/** Subscribe to the current-conversation store, tolerating its absence. */
function useCurrentSession(store: CurrentStore | null): {
  sessionId: string | null
  isNewConversation: boolean
} {
  const binding = useSyncExternalStore(
    store === null ? noopSubscribe : store.subscribe,
    store === null ? () => null : store.getSnapshot,
  ) as Binding | null
  const sessionId = typeof binding?.props?.sessionId === 'string' ? binding.props.sessionId : null
  return { sessionId, isNewConversation: binding?.hooks?.session?.blankBit === true }
}

function BootOverlay({
  store,
  previewAt = 0,
}: {
  store: CurrentStore | null
  /** Bumped by the library's preview button to force a play right now. */
  previewAt?: number
}): ReactElement | null {
  ensureStyle()

  const { sessionId, isNewConversation } = useCurrentSession(store)
  // Decided per open, so a change in the library panel lands on the next play.
  const fit = readFit()

  const [showing, setShowing] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const [phase, setPhase] = useState<'loading' | 'playing' | 'stalled' | 'error'>('loading')
  /**
   * Set when an UNMUTED autoplay was refused and the intro had to fall back
   * to a muted play. The hint then offers a click, because for a plain
   * browser tab that click is the only thing that can let sound through.
   */
  const [audioBlocked, setAudioBlocked] = useState(false)
  /**
   * Frozen at mount, deliberately: `videoSrc()` reads a value that resolves from
   * an async fetch, and letting the src change after mount is exactly the black
   * frame bug this plugin already paid for once (see the note above VIDEO_URL).
   */
  const [src, setSrc] = useState(videoSrc)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const closedRef = useRef(false)
  /** Mirrors `showing` for callbacks that must read it without re-rendering. */
  const showingRef = useRef(false)
  const lastSessionRef = useRef<string | null>(null)

  /**
   * The overlay chrome — the skip button — stays hidden until the pointer moves,
   * then fades out again. A full-frame intro should not carry a permanent button
   * in the corner, but the only way out of the overlay has to stay reachable.
   */
  const [chromeOn, setChromeOn] = useState(false)
  useEffect(() => {
    if (!showing) return undefined
    setChromeOn(false)
    let timer: number | null = null
    const onMove = () => {
      setChromeOn(true)
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => setChromeOn(false), 2200)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [showing])

  /**
   * The Windows caption strip is painted from --dsw-specific-sidebar-fill: the
   * Desktop preload measures that variable and forwards it over the
   * windowsAppearance IPC, which calls setTitleBarOverlay. Making it transparent
   * for the duration of the intro lets the video reach the top edge. Safe because
   * the overlay already covers the sidebar that shares the variable.
   */
  useEffect(() => {
    if (!showing) return undefined
    const body = document.body
    const previous = body.style.getPropertyValue('--dsw-specific-sidebar-fill')
    body.style.setProperty('--dsw-specific-sidebar-fill', 'rgba(0, 0, 0, 0)', 'important')
    return () => {
      if (previous === '') body.style.removeProperty('--dsw-specific-sidebar-fill')
      else body.style.setProperty('--dsw-specific-sidebar-fill', previous)
    }
  }, [showing])
  const close = useCallback(() => {
    closedRef.current = true
    showingRef.current = false
    setShowing(false)
    const video = videoRef.current
    if (video !== null) {
      try {
        video.pause()
      } catch {
        /* already stopped */
      }
    }
    if (document.fullscreenElement !== null && document.exitFullscreen !== undefined) {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  const open = useCallback(() => {
    // Re-pick only while the overlay is hidden. Changing the source of a video
    // that is already on screen restarts its media load mid-playback, which is
    // the black-frame failure this plugin already paid for once.
    if (!showingRef.current) {
      // Always a fresh play id. The host decides what it means: with one clip
      // ticked it resolves to that clip, with several it picks one it has not
      // just played. Gating this on a client-side flag only added a way for the
      // choice to be skipped entirely — which is what happened: the overlay kept
      // asking for the plain URL and the host fell back to the first clip.
      const next = playSrc()
      setSrc(next)
      notify('play', next)
    }
    showingRef.current = true
    closedRef.current = false
    setNeedsTap(false)
    setShowing(true)
  }, [])

  // Fire on every ENTRY into a conversation, not on every re-render.
  useEffect(() => {
    if (sessionId === null) return
    const entered = lastSessionRef.current !== sessionId
    lastSessionRef.current = sessionId
    if (!entered) return

    const pinned = readPinned()
    if (pinned !== null && pinned === sessionId) {
      // The designated conversation: every time it is opened.
      log('pinned session opened', sessionId)
      open()
      return
    }
    if (isNewConversation && !hasPlayed(sessionId)) {
      markPlayed(sessionId)
      log('new conversation', sessionId)
      open()
    }
  }, [sessionId, isNewConversation, open])

  /**
   * Play once whenever DSH itself is opened.
   *
   * The two triggers below are per-conversation: a brand new one, or the pinned
   * one. Neither fires for "the app just loaded and landed where I left off",
   * which is the moment an intro animation is actually for. So the overlay opens
   * once here, on mount, before any conversation is involved. Both existing
   * triggers stay exactly as they were; this only ever ADDS a play.
   *
   * Turn it off by setting the localStorage key dsh-boot-animation:boot to "off".
   */
  useEffect(() => {
    if (bootPlayed) return
    bootPlayed = true
    if (!readBootOn()) return
    // Wait for the clip list: in random mode the pool decides what plays, so
    // opening before it arrives would always play the same first clip.
    whenLibraryReady(() => {
      log('dsh opened, playing intro')
      open()
    })
  }, [open])

  // An explicit preview from the library. This exists because the normal trigger
  // is deliberately narrow — a NEW conversation plays once, and only a PINNED one
  // replays — so "I switched the clip and refreshed and the other one never
  // showed" was the expected behaviour of a design with no way to check your
  // choice. A preview button removes that guesswork.
  useEffect(() => {
    if (previewAt === 0) return
    log('preview requested', previewAt)
    open()
  }, [previewAt, open])

  // Start playback explicitly: relying on the autoplay attribute alone is
  // fragile, and a rejected play() has to surface as a tappable state.
  useEffect(() => {
    if (!showing) return undefined
    const video = videoRef.current
    if (video === null) return undefined
    // Sound first. The desktop shell DSH runs in allows an unmuted autoplay,
    // so the intro carries audio from the first frame and nothing has to be
    // clicked. A plain browser tab may refuse it; the catch below then falls
    // back to a muted play, which at least puts the picture on screen.
    video.muted = false
    video.volume = 1
    const openedAt = performance.now()
    /** One line that carries everything a black-frame report needs. */
    const report = (label: string): void =>
      notify(label, {
        ms: Math.round(performance.now() - openedAt),
        readyState: video.readyState,
        networkState: video.networkState,
        src: video.currentSrc || video.src,
      })
    const onPlaying = (): void => {
      setPhase('playing')
      report('first frame painted')
    }
    video.addEventListener('playing', onPlaying)
    const attempt = video.play()
    if (attempt !== undefined && typeof attempt.then === 'function') {
      attempt
        .then(() => log('play started, with sound'))
        .catch((error: unknown) => {
          log('unmuted play rejected, falling back to muted', String(error))
          setAudioBlocked(true)
          video.muted = true
          const retry = video.play()
          if (retry !== undefined && typeof retry.catch === 'function') {
            // Only a genuinely unplayable video (no decoder, bad container)
            // reaches here — that is the case that needs an explicit click.
            retry.catch(() => setNeedsTap(true))
          }
        })
    }
    const guard = window.setTimeout(() => {
      if (!closedRef.current) {
        // Report BEFORE closing: a silent close leaves nothing to diagnose.
        setPhase('stalled')
        report('stalled, giving up after ' + STALL_TIMEOUT_MS + 'ms')
        close()
      }
    }, STALL_TIMEOUT_MS)
    return () => {
      video.removeEventListener('playing', onPlaying)
      window.clearTimeout(guard)
    }
  }, [showing, close])

  if (!showing) return null

  /**
   * The click is a FALLBACK, not the normal path: with sound already playing
   * it does nothing at all. It exists for the browser-tab case, where an
   * unmuted autoplay is refused and a gesture is the only way to unmute.
   *
   * No Fullscreen API call: the overlay already covers the whole window, and
   * fullscreen needs the same gesture anyway, so it only ever added a second
   * thing the intro had to ask the user for.
   */
  const activate = () => {
    const video = videoRef.current
    if (video === null) return
    if (!video.muted && !needsTap) return
    if (needsTap) setNeedsTap(false)
    video.muted = false
    setAudioBlocked(false)
    const attempt = video.play()
    if (attempt !== undefined && typeof attempt.catch === 'function') attempt.catch(() => {})
  }

  return h(
    'div',
    { className: 'dba-root', onClick: activate },
    h('video', {
      ref: videoRef,
      className: fit === 'cover' ? 'dba-video dba-cover' : 'dba-video',
      src,
      muted: false,
      autoPlay: true,
      playsInline: true,
      preload: 'auto',
      onEnded: close,
      onError: () => {
        const video = videoRef.current
        const code = video?.error?.code ?? 0
        const message = video?.error?.message ?? ''
        notify('video element error', { code, message, src: video?.currentSrc || src, readyState: video?.readyState ?? -1 })
        setPhase('error')
        // Do not slam the overlay shut: the reason has to stay readable for a
        // moment, and 跳过 is right there. The stall watchdog would have closed
        // it silently, which is how a real failure looks like "nothing happened".
        window.setTimeout(() => {
          if (!closedRef.current) close()
        }, 8000)
      },
      onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
    }),
    phase === 'playing'
      ? null
      : h(
          'div',
          { className: 'dba-status' },
          phase === 'error'
            ? '视频加载失败 —— 控制台有 [dsh-boot-animation] 日志'
            : phase === 'stalled'
              ? '视频加载超时'
              : '正在加载视频…',
        ),
    h(
      'button',
      {
        type: 'button',
        className: chromeOn ? 'dba-skip dba-skip-on' : 'dba-skip',
        onClick: (event: { stopPropagation: () => void }) => {
          event.stopPropagation()
          close()
        },
      },
      '跳过',
    ),
    needsTap || audioBlocked
      ? h('div', { className: 'dba-hint' }, needsTap ? '点击播放' : '点击开启声音')
      : null,
  )
}

/** The pin toggle that lives beside Settings at the sidebar foot. */
function PinAction({ store, onOpen }: { store: CurrentStore | null; onOpen: () => void }): unknown {
  ensureStyle()
  const { sessionId } = useCurrentSession(store)
  const [pinned, setPinned] = useState<string | null>(() => readPinned())
  const isPinned = sessionId !== null && pinned === sessionId

  const toggle = () => {
    const next = isPinned ? null : sessionId
    writePinned(next)
    setPinned(next)
    log('pin toggled', { from: pinned, to: next })
  }

  const title = isPinned
    ? '这个会话已设为片头会话：每次打开都会播放片头动画（点击取消）'
    : '把这个会话设为片头会话：以后每次打开它都会播放片头动画'

  return h(
    'span',
    { className: 'dba-pin-wrap', style: { display: 'inline-flex', alignItems: 'center' } },
    h(
      'button',
      {
        type: 'button',
        className: isPinned ? 'dba-pin dba-pin-on' : 'dba-pin',
        title,
        'aria-label': title,
        disabled: sessionId === null,
        onClick: toggle,
      },
      isPinned ? '🎬' : '🎞',
    ),
    h(
      'button',
      {
        type: 'button',
        className: 'dba-pin dba-lib-open',
        title: '片头片库：查看、切换或添加片头视频',
        'aria-label': '打开片头片库',
        onClick: onOpen,
      },
      '🎛',
    ),
  )
}

/** One entry as the host lists it. */
type VideoInfo = {
  id: string
  name: string
  file: string
  ext?: string
  source: string
  writable?: boolean
  bytes: number
  mtime: string
  legacy?: boolean
  faststart?: boolean
  copies?: number
  alsoAt?: string[]
  active?: boolean
}

type VideoList = {
  activeId: string | null
  activeHow?: string
  /** The ids the panel ticks: the clips that rotate, in host order. */
  picked?: string[]
  /** True when those ticks were chosen explicitly (rather than "all of mine"). */
  pickedExplicit?: boolean
  /** True while more than one clip rotates. */
  random?: boolean
  /** The rotating clips, with names — same set as `picked`. */
  randomPool?: VideoInfo[]
  videos: VideoInfo[]
  userDir: string
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1024 / 1024).toFixed(2) + ' MB'
}

/**
 * Where a clip comes from, as one word a user can act on.
 *
 * The plugin's clips are embedded in code now, so there is a single built-in
 * kind; anything else on the list is a file the user put there.
 */
const SOURCE_LABEL: Record<string, string> = {
  yours: '你自己加的',
  embedded: '插件内置',
  env: '环境变量',
}

/**
 * The video library: every .mp4 the host can see, the active one marked, and a
 * click to switch. Adding a video stays a filesystem action — the user drops a
 * file in and presses refresh — because a browser-side upload would have to
 * carry the bytes through this route for no gain on a local-only plugin.
 */
function VideoLibrary({ onClose, onPreview }: { onClose: () => void; onPreview: () => void }): ReactElement {
  ensureStyle()
  const [state, setState] = useState<VideoList | null>(null)
  const [fit, setFit] = useState<Fit>(() => readFit())
  const [msg, setMsg] = useState<{ text: string; kind: string }>({ text: '', kind: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch(LIST_URL, { cache: 'no-store' })
      const data = (await response.json()) as VideoList
      setState(data)
      setMsg({ text: '', kind: '' })
    } catch (error: unknown) {
      setMsg({ text: '读取片库失败：' + String(error), kind: 'dba-err' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Esc closes, like any other dialog in the shell.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /**
   * Writes one choice, then re-reads the list.
   *
   * Shared by both kinds of choice, which differ only in the body they post and
   * the sentence they report: a fixed clip (`{ id }`) or the rotation
   * (`{ random: true }`).
   */
  const post = useCallback(
    async (
      body: Record<string, unknown>,
      describe: (data: { name?: string; pool?: number }) => string,
    ) => {
      setBusy(true)
      try {
        const response = await fetch(SELECT_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = (await response.json()) as {
          ok?: boolean
          error?: string
          name?: string
          pool?: number
        }
        if (data.ok === true) {
          setMsg({ text: describe(data), kind: 'dba-ok' })
          // A selection change swaps the bytes behind the constant media URL, so the
          // content key has to be re-resolved here. Leaving the stale ?v= in place makes
          // the browser replay the previously cached (immutable) clip, so the switch
          // looks like it did nothing until a full page reload.
          versionStarted = false
          activeVersion = null
          resolveActiveVersion()
          await load()
        } else {
          setMsg({ text: '切换失败：' + String(data.error ?? '未知错误'), kind: 'dba-err' })
        }
      } catch (error: unknown) {
        setMsg({ text: '切换失败：' + String(error), kind: 'dba-err' })
      } finally {
        setBusy(false)
      }
    },
    [load],
  )

  /** Tick or untick one clip. The host owns the resulting list. */
  const toggle = useCallback(
    (id: string, name: string) =>
      post({ toggle: id }, (data) => {
        const count = data.pool ?? 0
        return count > 1
          ? '已更新轮换：' + String(count) + ' 段，每次开播随机挑一段'
          : '只勾了「' + name + '」：固定播这一段'
      }),
    [post],
  )

  const videos = state === null ? [] : state.videos
  const pickedIds = state === null || !Array.isArray(state.picked) ? [] : state.picked
  const picked = new Set(pickedIds)

  return h(
    'div',
    {
      className: 'dba-veil',
      onClick: (event: { target: unknown; currentTarget: unknown; stopPropagation: () => void }) => {
        if (event.target === event.currentTarget) onClose()
      },
    },
    h(
      'div',
      { className: 'dba-lib', onClick: (event: { stopPropagation: () => void }) => event.stopPropagation() },
      h('h3', null, '片头片库'),
      h(
        'p',
        null,
        '勾选要轮流播放的片子（当前 ' +
          String(pickedIds.length) +
          ' 段）：勾 1 段 = 固定播它，勾多段 = 每次开播随机挑一段。',
      ),
      ...(videos.length === 0
        ? [h('div', { className: 'dba-item' }, h('span', { className: 'dba-nm' }, '（还没找到任何视频）'))]
        : videos.map((v) =>
            h(
              'div',
              {
                key: v.id,
                className: 'dba-item' + (picked.has(v.id) ? ' dba-cur' : ''),
                title: v.file,
                onClick: () => {
                  if (busy) return
                  // Embedded clips are tickable too: on an install where nothing
                  // has been added yet, the shipped clips are the rotation.
                  void toggle(v.id, v.name)
                },
              },
              h('span', { className: 'dba-mark' }, picked.has(v.id) ? '✓' : ''),
              h('span', { className: 'dba-nm' }, v.name),
              v.legacy ? h('span', { className: 'dba-badge' }, '原片源') : null,
              (v.copies ?? 1) > 1
                ? h(
                    'span',
                    {
                      className: 'dba-badge',
                      title:
                        '这一段在磁盘上有 ' +
                        String(v.copies) +
                        ' 份相同的副本，已合并成一条。你的文件没有被删，只是不重复列出。',
                    },
                    '合并 ' + String(v.copies) + ' 份重复',
                  )
                : null,
              // Only nudges on containers that can carry moov. A .webm has none,
              // so "not optimised" would be a lie about it.
              (v.ext === '.mp4' || v.ext === '.m4v') && v.faststart === false
                ? h(
                    'span',
                    {
                      className: 'dba-badge dba-b-warn',
                      title: '这个文件的索引表(moov)在末尾：浏览器要整段下载完才出画面，容易黑屏。用 ffmpeg -c copy -movflags +faststart 重排一次即可。',
                    },
                    '⚠ 未优化',
                  )
                : null,
              h('span', { className: 'dba-badge' }, SOURCE_LABEL[v.source] ?? v.source),
              h('span', { className: 'dba-meta' }, formatBytes(v.bytes)),
            ),
          )),
      h(
        'div',
        { className: 'dba-dir' },
        '想加自己的片子：把 mp4 放进这个文件夹，再点「刷新」',
        h('br', null),
        h('code', null, state === null ? '…' : state.userDir),
      ),
      h(
        'div',
        { className: 'dba-fit' },
        h('span', null, '播放时：'),
        h(
          'button',
          {
            type: 'button',
            className: 'dba-btn' + (fit === 'cover' ? ' dba-btn-on' : ''),
            title: '铺满整个窗口，超出部分裁掉 —— 不留黑边',
            onClick: () => {
              writeFit('cover')
              setFit('cover')
              setMsg({ text: '已设为「铺满屏幕」：下次播放生效', kind: 'dba-ok' })
            },
          },
          '铺满屏幕',
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dba-btn' + (fit === 'contain' ? ' dba-btn-on' : ''),
            title: '完整显示整帧，长宽比不匹配时留黑边',
            onClick: () => {
              writeFit('contain')
              setFit('contain')
              setMsg({ text: '已设为「完整显示」：下次播放生效', kind: 'dba-ok' })
            },
          },
          '完整显示',
        ),
      ),
      h(
        'div',
        { className: 'dba-bar' },
        h(
          'button',
          {
            type: 'button',
            className: 'dba-btn dba-btn-preview',
            title: '立刻播放当前选中的这段，不用等下一次开新对话或钉住的会话',
            onClick: onPreview,
          },
          '▶ 预览当前',
        ),
        h(
          'button',
          { type: 'button', className: 'dba-btn', onClick: () => void load() },
          '刷新',
        ),
        h('button', { type: 'button', className: 'dba-btn', onClick: onClose }, '关闭'),
      ),
      h('div', { className: 'dba-msg ' + msg.kind }, msg.text),
    ),
  )
}

type ClientContext = {
  slots: {
    inject: (name: string, register: () => unknown) => unknown
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
  uiSession?: { adapter?: { current?: CurrentStore } }
  effect?: (callback: () => unknown, label?: string) => unknown
}

/**
 * Opens the library from outside the overlay's own React tree.
 *
 * The pin sits in a different slot than the overlay, so it cannot share React
 * state with the component that renders the dialog: they are two separate roots
 * that this plugin happens to register. A module-level listener pair is the
 * smallest honest bridge between them.
 */
const libraryOpeners = new Set<() => void>()
function openLibrary(): void {
  for (const open of libraryOpeners) {
    try {
      open()
    } catch {
      /* a stale subscriber must not break the pin */
    }
  }
}

export function apply(ctx: ClientContext): void {
  const candidate = ctx.uiSession?.adapter?.current
  const store =
    candidate !== undefined &&
    typeof candidate.getSnapshot === 'function' &&
    typeof candidate.subscribe === 'function'
      ? candidate
      : null
  log('apply', { hasUiSession: ctx.uiSession !== undefined, hasStore: store !== null })

  // Warm the media cache before any overlay can open, so the first play starts
  // from the local copy instead of the network. Deliberately here, not at the
  // trigger: the version has to be known before a src is built.
  resolveActiveVersion()

  // Rendering a JSX-free tree on purpose (createElement), so no provider
  // element is involved. Hooks live in AppRoot, never in apply: apply is called
  // by the plugin loader, not by React, and a hook call there would throw.
  const AppRoot = () => {
    const [libOpen, setLibOpen] = useState(false)
    // Bumped on preview. Closing the library and bumping in the same handler is
    // what makes it work: BootOverlay only exists while the library is closed.
    const [previewAt, setPreviewAt] = useState(0)

    const openSelf = useCallback(() => setLibOpen(true), [])
    useEffect(() => {
      libraryOpeners.add(openSelf)
      return () => {
        libraryOpeners.delete(openSelf)
      }
    }, [openSelf])

    // Rendered as ELEMENTS, never called as plain functions. Calling a
    // component directly would run its hooks against AppRoot's own hook list,
    // so toggling the library would change AppRoot's hook count between renders
    // and React would throw "Rendered more hooks than during the previous
    // render" the moment the picker opened.
    //
    // No `activeId` state lives here: the overlay always loads VIDEO_URL and the
    // host resolves which clip that is per request, so a switch is picked up on
    // the next open without threading an id into the src mid-playback.
    if (libOpen) {
      return h(VideoLibrary, {
        onClose: () => setLibOpen(false),
        onPreview: () => {
          setLibOpen(false)
          setPreviewAt((n) => n + 1)
        },
      })
    }
    return h(BootOverlay, { store, previewAt })
  }

  const Pin = () => h(PinAction, { store, onOpen: () => openLibrary() })

  // Slot names are inlined on purpose: the injector's pre-flight check reads
  // register() calls statically and cannot follow a constant.
  const mount = () => {
    ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register({ name: 'shell.overlay', id: 'dsh-boot-animation', order: 900 }, AppRoot),
    )
    ctx.slots.inject('sidebar.footer.action', () =>
      ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'dsh-boot-animation-pin', order: 40, label: () => '片头动画' },
        Pin,
      ),
    )
  }
  if (typeof ctx.effect === 'function') ctx.effect(mount, 'dsh-boot-animation: mounts')
  else mount()
}
