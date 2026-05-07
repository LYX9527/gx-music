"use client"

import { useEffect, useRef } from "react"

interface UseHotkeysOptions {
  onPlayPause: () => void
  onPrev: () => void
  onNext: () => void
  /** Seek by `delta` seconds. Called for ←/→. */
  onSeekBy?: (delta: number) => void
  /** Adjust volume by `delta` (range 0-100). Called for ↑/↓. */
  onVolumeBy?: (delta: number) => void
  /** Toggle mute / restore. Called for M. */
  onToggleMute?: () => void
  /** Disable all hotkeys (e.g. while a modal owns the focus). */
  disabled?: boolean
}

/**
 * Global keyboard shortcuts for the player. Intentionally lives at the
 * window level (so it works even when no specific element is focused),
 * but bails out when a text input / textarea / contentEditable element
 * is focused so users can type freely in the search panel and dialogs.
 *
 * Bindings:
 *   Space            — play/pause
 *   ← / →            — seek -5s / +5s
 *   Cmd+← / Cmd+→    — prev / next track  (Ctrl on Windows/Linux)
 *   ↑ / ↓            — volume +5 / -5
 *   M                — mute toggle
 *
 * The handlers are kept in a ref so users can pass fresh closures every
 * render without re-binding the global listener.
 */
export function useHotkeys(opts: UseHotkeysOptions) {
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const isTextEditing = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
      if (target.isContentEditable) return true
      return false
    }

    const handler = (e: KeyboardEvent) => {
      const o = optsRef.current
      if (o.disabled) return
      if (isTextEditing(e.target)) return
      // Ignore if any modal/dialog is open and traps focus by setting
      // aria-hidden on the body — Radix sets `data-scroll-locked` on
      // body when modals are open. Be permissive: only intercept when
      // it's clearly safe.
      if (document.body.hasAttribute("data-scroll-locked") && e.key !== "Escape") {
        return
      }

      const meta = e.metaKey || e.ctrlKey

      switch (e.key) {
        case " ":
        case "Spacebar":
          e.preventDefault()
          o.onPlayPause()
          break
        case "ArrowLeft":
          e.preventDefault()
          if (meta) o.onPrev()
          else o.onSeekBy?.(-5)
          break
        case "ArrowRight":
          e.preventDefault()
          if (meta) o.onNext()
          else o.onSeekBy?.(5)
          break
        case "ArrowUp":
          e.preventDefault()
          o.onVolumeBy?.(5)
          break
        case "ArrowDown":
          e.preventDefault()
          o.onVolumeBy?.(-5)
          break
        case "m":
        case "M":
          if (meta) return // don't shadow Cmd+M (minimize on macOS)
          e.preventDefault()
          o.onToggleMute?.()
          break
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])
}
