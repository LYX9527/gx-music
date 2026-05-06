"use client"

import { useEffect, useRef, useState } from "react"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Music,
  Heart,
  ListMusic,
  Mic2,
} from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { useImageColors } from "@/hooks/use-image-colors"
import type { Track } from "@/components/track-list"

declare global {
  interface Window {
    __TAURI_INTERNALS__?: any
  }
}

interface PlayerState {
  track: Track | null
  isPlaying: boolean
  currentTime: number
  duration: number
  activeLyric: string
  beatIntensity: number
}

const INITIAL_STATE: PlayerState = {
  track: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  activeLyric: "",
  beatIntensity: 0,
}

function formatTime(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function MiniPlayer() {
  const [state, setState] = useState<PlayerState>(INITIAL_STATE)
  const [draggingTime, setDraggingTime] = useState<number | null>(null)
  const [liked, setLiked] = useState(false)
  const apiReadyRef = useRef(false)
  const apiRef = useRef<{
    invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
    emit: (event: string, payload?: unknown) => Promise<void>
  } | null>(null)

  // Pull dynamic palette from the cover so the popover background breathes
  // with the album, just like the main window does.
  const colors = useImageColors(state.track?.cover || "")
  const rgba = (rgb: string, a: number) =>
    rgb.replace("rgb", "rgba").replace(")", `,${a})`)

  // Bind to Tauri runtime: subscribe to player:state, fire menu-bar:ready handshake.
  useEffect(() => {
    let unlisten: (() => void) | null = null
    let mounted = true

    ;(async () => {
      if (typeof window === "undefined" || !window.__TAURI_INTERNALS__) return
      const [{ invoke }, { emit, listen }] = await Promise.all([
        import("@tauri-apps/api/core"),
        import("@tauri-apps/api/event"),
      ])
      apiRef.current = {
        invoke: invoke as never,
        emit: emit as never,
      }
      apiReadyRef.current = true

      unlisten = await listen<PlayerState>("player:state", (e) => {
        if (!mounted) return
        setState(e.payload)
      })

      // Tell the main window we just woke up — it will push a fresh snapshot.
      emit("menu-bar:ready").catch(() => {})
    })()

    return () => {
      mounted = false
      if (unlisten) unlisten()
    }
  }, [])

  const sendCmd = (action: string, extra?: Record<string, unknown>) => {
    apiRef.current?.emit("player:cmd", { action, ...extra }).catch(() => {})
  }

  // Optimistically flip the playing state on click so the button reflects the
  // user's intent immediately. The authoritative state from the main window
  // arrives on the next `player:state` broadcast and overrides this — but the
  // user already sees a snappy UI without a perceived lag.
  const handlePlayPauseClick = () => {
    setState((s) => ({ ...s, isPlaying: !s.isPlaying }))
    sendCmd("playpause")
  }

  const handleClose = () => {
    apiRef.current?.invoke("hide_menu_bar_window").catch(() => {})
  }

  const handleSeek = (v: number) => {
    setDraggingTime(v)
  }
  const handleSeekCommit = (v: number) => {
    sendCmd("seek", { time: v })
    // Optimistic update so the bar doesn't snap back before the broadcast lands.
    setState((s) => ({ ...s, currentTime: v }))
    setDraggingTime(null)
  }

  const { track, isPlaying, currentTime, duration, activeLyric, beatIntensity } = state
  const displayTime = draggingTime ?? currentTime

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden rounded-2xl select-none cursor-default"
      style={{
        background: track
          ? `
              radial-gradient(ellipse at 30% 0%, ${rgba(colors.dominant, 0.65)} 0%, transparent 60%),
              radial-gradient(ellipse at 70% 100%, ${rgba(colors.secondary, 0.5)} 0%, transparent 55%),
              linear-gradient(160deg, rgba(18,18,28,0.92) 0%, rgba(8,8,16,0.96) 100%)
            `
          : "linear-gradient(160deg, rgba(18,18,28,0.92) 0%, rgba(8,8,16,0.96) 100%)",
        boxShadow:
          "inset 0 0 0 1px rgba(255,255,255,0.06), 0 24px 60px -12px rgba(0,0,0,0.7)",
        transition: "background 1s ease-out",
      }}
    >
      {/* Drag region + close */}
      <div
        data-tauri-drag-region
        className="relative flex h-9 shrink-0 items-center justify-between px-3"
      >
        <div data-tauri-drag-region className="absolute inset-0" />
        <span className="relative z-10 text-[11px] font-semibold tracking-widest text-white/40 uppercase">
          Music · Mini
        </span>
        <button
          onClick={handleClose}
          className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
          title="关闭"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Cover hero block */}
      <div className="relative flex-1 px-4 pt-1 pb-3 min-h-0">
        {track && track.cover ? (
          <>
            {/* Blurred backdrop */}
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage: `url(${track.cover})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(28px) saturate(1.3)",
                transform: "scale(1.2)",
              }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black/70" />

            <div className="relative flex h-full flex-col items-center justify-center gap-3">
              <div
                className="relative w-32 h-32 overflow-hidden rounded-xl shadow-2xl"
                style={{
                  boxShadow: `
                    0 20px 35px -8px rgba(0,0,0,0.75),
                    0 0 ${20 + beatIntensity * 30}px ${rgba(colors.dominant, 0.35 + beatIntensity * 0.4)}
                  `,
                  transition: "box-shadow 0.15s ease-out",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={track.cover}
                  alt={track.title}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-col items-center text-center px-2 max-w-full">
                <h2 className="text-[15px] font-bold text-white truncate w-full">
                  {track.title}
                </h2>
                <p className="text-[11px] text-white/55 truncate w-full mt-0.5">
                  {track.artist}
                  {track.album ? ` · ${track.album}` : ""}
                </p>
                {activeLyric && (
                  <p
                    className="mt-2 text-[12px] font-medium text-white/85 truncate w-full"
                    style={{ textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}
                  >
                    {activeLyric}
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white/30">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.04]">
              <Music className="h-8 w-8 opacity-50" />
            </div>
            <p className="text-[12px] tracking-widest uppercase">暂无播放</p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="relative px-5 pt-1">
        <Slider
          value={[displayTime]}
          max={duration || 100}
          step={1}
          onValueChange={([v]) => handleSeek(v)}
          onValueCommit={([v]) => handleSeekCommit(v)}
          className="[&_[data-slot=slider-track]]:h-[3px] [&_[data-slot=slider-track]]:bg-white/10 [&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-thumb]]:h-2.5 [&_[data-slot=slider-thumb]]:w-2.5 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:opacity-0 hover:[&_[data-slot=slider-thumb]]:opacity-100 transition-opacity"
        />
        <div className="mt-1 flex justify-between text-[9px] tabular-nums text-white/40">
          <span>{formatTime(displayTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between px-4 pt-2 pb-4 shrink-0">
        <button
          onClick={() => setLiked((v) => !v)}
          className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
            liked ? "text-primary" : "text-white/55 hover:text-white/85"
          }`}
          title="喜欢"
        >
          <Heart className="h-3.5 w-3.5" fill={liked ? "currentColor" : "none"} />
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => sendCmd("prev")}
            className="text-white/80 transition-colors hover:text-white"
            title="上一首"
          >
            <SkipBack className="h-4 w-4" fill="currentColor" />
          </button>
          <button
            onClick={handlePlayPauseClick}
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-95 hover:scale-105"
            style={{
              boxShadow: isPlaying
                ? `0 0 ${12 + beatIntensity * 18}px rgba(200,80,60,${0.4 + beatIntensity * 0.4})`
                : "0 4px 12px rgba(200,80,60,0.35)",
              transition: "box-shadow 0.15s ease-out, transform 0.15s ease-out",
            }}
            title={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5" fill="currentColor" />
            ) : (
              <Play className="h-3.5 w-3.5 ml-0.5" fill="currentColor" />
            )}
          </button>
          <button
            onClick={() => sendCmd("next")}
            className="text-white/80 transition-colors hover:text-white"
            title="下一首"
          >
            <SkipForward className="h-4 w-4" fill="currentColor" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => sendCmd("toggle-lyrics")}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/55 transition-colors hover:text-white/85"
            title="歌词"
          >
            <Mic2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
