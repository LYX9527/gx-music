"use client"

import { useEffect, useRef } from "react"
import type { Track } from "@/components/track-list"

type Listener<T> = (event: { payload: T }) => void
type UnlistenFn = () => void

interface TrayApi {
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>
  emit: (event: string, payload?: unknown) => Promise<void>
  listen: <T>(event: string, handler: Listener<T>) => Promise<UnlistenFn>
}

let cachedApi: TrayApi | null = null
async function getApi(): Promise<TrayApi | null> {
  if (cachedApi) return cachedApi
  if (typeof window === "undefined") return null
  // Tauri bootstraps `__TAURI_INTERNALS__` before user scripts run when the page is
  // served by the native shell. In dev (Next.js localhost), the property is missing.
  // We don't want the hook to throw in plain browser preview.
  if (!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return null

  const [{ invoke }, { emit, listen }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
  ])
  cachedApi = { invoke, emit, listen: listen as TrayApi["listen"] }
  return cachedApi
}

export interface PlayerStatePayload {
  track: Track | null
  isPlaying: boolean
  currentTime: number
  duration: number
  activeLyric: string
  beatIntensity: number
}

interface UseTraySyncOptions {
  track: Track | null
  isPlaying: boolean
  currentTime: number
  duration: number
  /** Full active lyric line — used by the popup, which truncates with CSS. */
  activeLyric: string
  /**
   * Pre-sliced window of the active lyric for the macOS status bar title.
   * Should change ~once per character-step over the line's duration. We
   * dedupe before invoking IPC so the channel stays quiet when it doesn't.
   */
  trayLyricSlice: string
  beatIntensity: number
  onPlayPause: () => void
  onPrev: () => void
  onNext: () => void
  onSeek?: (time: number) => void
  onShowLyrics?: () => void
  onShowPlaylist?: () => void
}

/**
 * Bridges the main window's audio player with:
 *   1. The macOS status bar (tray title = current lyric, tooltip = song info)
 *   2. The mini-player popover window (broadcasts state, receives commands)
 *   3. The native right-click tray menu (receives forwarded commands)
 */
export function useTraySync(opts: UseTraySyncOptions) {
  const {
    track,
    isPlaying,
    currentTime,
    duration,
    activeLyric,
    trayLyricSlice,
    beatIntensity,
    onPlayPause,
    onPrev,
    onNext,
    onSeek,
    onShowLyrics,
    onShowPlaylist,
  } = opts

  // We use refs to keep the latest callbacks so the listener side-effect can
  // stay subscribed across renders without re-binding.
  const cbs = useRef({ onPlayPause, onPrev, onNext, onSeek, onShowLyrics, onShowPlaylist })
  cbs.current = { onPlayPause, onPrev, onNext, onSeek, onShowLyrics, onShowPlaylist }

  // Push the (possibly sliding) lyric window into the macOS status bar title.
  // The slice value is recomputed by the parent on every currentTime tick;
  // we rely on React's [trayLyricSlice] dep to dedupe so we only invoke when
  // the visible characters actually change.
  const lastTrayTitleRef = useRef<string>("")
  useEffect(() => {
    if (lastTrayTitleRef.current === trayLyricSlice) return
    lastTrayTitleRef.current = trayLyricSlice

    let cancelled = false
    getApi().then((api) => {
      if (!api || cancelled) return
      api.invoke("set_tray_title", { text: trayLyricSlice ?? "" }).catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [trayLyricSlice])

  // Update the tray tooltip whenever track changes.
  useEffect(() => {
    let cancelled = false
    const tooltip = track ? `${track.title} — ${track.artist}` : ""
    getApi().then((api) => {
      if (!api || cancelled) return
      api.invoke("set_tray_tooltip", { text: tooltip }).catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [track])

  // Broadcast immediately on key state changes (track/isPlaying/duration/lyric).
  // These are user-perceptible events — never throttle them or the popup
  // toggles between play/pause states a beat behind reality.
  useEffect(() => {
    let cancelled = false
    getApi().then((api) => {
      if (!api || cancelled) return
      const payload: PlayerStatePayload = {
        track,
        isPlaying,
        currentTime,
        duration,
        activeLyric,
        beatIntensity,
      }
      api.emit("player:state", payload).catch(() => {})
    })
    return () => {
      cancelled = true
    }
    // currentTime / beatIntensity intentionally excluded — they have their
    // own throttled broadcaster below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, isPlaying, duration, activeLyric])

  // Broadcast currentTime + beatIntensity at a capped rate (~4 fps).
  // This is the "smooth progress bar" channel, not the "state changed" channel.
  const lastBroadcastRef = useRef(0)
  useEffect(() => {
    const now = Date.now()
    if (lastBroadcastRef.current && now - lastBroadcastRef.current < 250) return
    lastBroadcastRef.current = now

    let cancelled = false
    const payload: PlayerStatePayload = {
      track,
      isPlaying,
      currentTime,
      duration,
      activeLyric,
      beatIntensity,
    }
    getApi().then((api) => {
      if (!api || cancelled) return
      api.emit("player:state", payload).catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [currentTime, beatIntensity, track, isPlaying, duration, activeLyric])

  // Snapshot ref so the menu-bar:ready handler always replies with the latest
  // state (avoids stale-closure issues when the popup opens mid-playback).
  const snapshotRef = useRef<PlayerStatePayload>({
    track,
    isPlaying,
    currentTime,
    duration,
    activeLyric,
    beatIntensity,
  })
  snapshotRef.current = {
    track,
    isPlaying,
    currentTime,
    duration,
    activeLyric,
    beatIntensity,
  }

  // Listen for commands from the popup and tray right-click menu.
  useEffect(() => {
    let unlisteners: UnlistenFn[] = []
    let cancelled = false

    getApi().then(async (api) => {
      if (!api || cancelled) return

      const handle = (action: string) => {
        switch (action) {
          case "play":
          case "pause":
          case "playpause":
            cbs.current.onPlayPause()
            break
          case "prev":
            cbs.current.onPrev()
            break
          case "next":
            cbs.current.onNext()
            break
          case "toggle-lyrics":
            cbs.current.onShowLyrics?.()
            break
          case "show-playlist":
            cbs.current.onShowPlaylist?.()
            break
        }
      }

      const u1 = await api.listen<{ action: string; time?: number }>("player:cmd", (e) => {
        if (e.payload.action === "seek" && typeof e.payload.time === "number") {
          cbs.current.onSeek?.(e.payload.time)
        } else {
          handle(e.payload.action)
        }
      })
      const u2 = await api.listen<{ action: string }>("tray:command", (e) => {
        handle(e.payload.action)
      })
      // Popup signals it just opened — push fresh state immediately. Reads
      // from snapshotRef so we never hand it a stale closure.
      const u3 = await api.listen("menu-bar:ready", () => {
        api.emit("player:state", snapshotRef.current).catch(() => {})
      })

      if (cancelled) {
        u1()
        u2()
        u3()
      } else {
        unlisteners = [u1, u2, u3]
      }
    })

    return () => {
      cancelled = true
      unlisteners.forEach((u) => {
        try {
          u()
        } catch {}
      })
    }
  }, [])
}
