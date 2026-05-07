"use client"

import { memo, useState } from "react"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  Volume1,
  VolumeX,
  ListMusic,
  Music,
  Mic2,
  RefreshCw,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { useAudioState } from "./audio-state-context"

import { Track } from "./track-list"

export type PlayMode = "list" | "single" | "shuffle"

/**
 * Props deliberately exclude high-frequency audio state
 * (currentTime / duration / beatIntensity / isPlaying / isLoading) — those
 * flow through `AudioStateContext` so this component can be wrapped in
 * `memo` and stay frozen at 60fps. Only the play button and progress bar
 * (which subscribe to the context) re-render on each tick.
 */
interface PlayerControlsProps {
  currentTrack: Track | null
  onPlayPause: () => void
  onNext: () => void
  onPrev: () => void
  playMode: PlayMode
  onPlayModeChange: () => void
  volume: number
  onVolumeChange: (v: number) => void
  onSeek: (t: number) => void
  viewMode: "discover" | "playing" | "playlist" | "local"
  onToggleView: (mode: "discover" | "playing" | "playlist" | "local") => void
  playError?: string
  onRetry?: () => void
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

/**
 * Subscribes to AudioStateContext for currentTime/duration. Holds a local
 * `dragValue` so the slider thumb sticks to the user's pointer during a
 * drag even as audio.currentTime keeps advancing in the background.
 *
 * `onValueCommit` (mouseup) fires the actual seek — this both prevents
 * the thumb from snapping back and avoids hammering audio.currentTime=v
 * on every micro-pixel of drag.
 */
interface ProgressBarProps {
  onSeek: (t: number) => void
}

const ProgressBar = memo(function ProgressBar({ onSeek }: ProgressBarProps) {
  const { currentTime, duration } = useAudioState()
  const [dragValue, setDragValue] = useState<number | null>(null)
  const display = dragValue ?? currentTime

  return (
    <div className="flex w-full items-center gap-3">
      <span className="w-10 text-right text-[10px] tabular-nums text-muted-foreground">
        {formatTime(display)}
      </span>
      <Slider
        value={[display]}
        max={duration || 100}
        step={1}
        onValueChange={([v]) => setDragValue(v)}
        onValueCommit={([v]) => {
          onSeek(v)
          setDragValue(null)
        }}
        className="flex-1 [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-foreground/[0.08] [&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-thumb]]:h-2.5 [&_[data-slot=slider-thumb]]:w-2.5 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:opacity-0 hover:[&_[data-slot=slider-thumb]]:opacity-100 focus-within:[&_[data-slot=slider-thumb]]:opacity-100 transition-opacity"
      />
      <span className="w-10 text-left text-[10px] tabular-nums text-muted-foreground">
        {formatTime(duration)}
      </span>
    </div>
  )
})

/**
 * Subscribes to AudioStateContext so the beat-driven box-shadow updates at
 * 60fps without re-rendering its parent.
 */
interface PlayButtonProps {
  onPlayPause: () => void
}

const PlayButton = memo(function PlayButton({ onPlayPause }: PlayButtonProps) {
  const { isPlaying, isLoading, beatIntensity } = useAudioState()
  return (
    <button
      onClick={onPlayPause}
      disabled={isLoading}
      className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform duration-150 hover:scale-105 active:scale-95 disabled:opacity-90 disabled:cursor-progress"
      style={{
        boxShadow: isPlaying
          ? `0 0 ${15 + beatIntensity * 20}px rgba(200, 80, 60, ${0.4 + beatIntensity * 0.4})`
          : undefined,
      }}
      title={isLoading ? "加载中…" : isPlaying ? "暂停" : "播放"}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isPlaying ? (
        <Pause className="h-4 w-4" fill="currentColor" />
      ) : (
        <Play className="h-4 w-4 ml-0.5" fill="currentColor" />
      )}
    </button>
  )
})

/**
 * Subscribes to isLoading only — used for the mini-cover loading overlay
 * in the bottom-left of the player bar.
 */
const MiniCoverLoadingOverlay = memo(function MiniCoverLoadingOverlay() {
  const { isLoading } = useAudioState()
  if (!isLoading) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
      <Loader2 className="h-4 w-4 animate-spin text-white" />
    </div>
  )
})

const PLAY_MODE_CONFIG: Record<PlayMode, { icon: typeof Repeat; label: string }> = {
  list: { icon: Repeat, label: "列表循环" },
  single: { icon: Repeat1, label: "单曲循环" },
  shuffle: { icon: Shuffle, label: "随机播放" },
}

export const PlayerControls = memo(function PlayerControls({
  currentTrack,
  onPlayPause,
  onNext,
  onPrev,
  playMode,
  onPlayModeChange,
  volume,
  onVolumeChange,
  onSeek,
  viewMode,
  onToggleView,
  playError,
  onRetry,
}: PlayerControlsProps) {
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2
  const modeConfig = PLAY_MODE_CONFIG[playMode]
  const ModeIcon = modeConfig.icon

  return (
    <div className="flex h-20 w-full shrink-0 items-center justify-between border-t border-foreground/[0.06] bg-background/50 backdrop-blur-md px-6 z-20 select-none shadow-[0_-5px_20px_rgba(0,0,0,0.2)]">
      {/* Left: Mini Cover & Info */}
      <div className="flex w-[250px] shrink-0 items-center gap-3">
        {currentTrack ? (
          <>
            <div
              className={`relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-md group transition-transform hover:scale-105 active:scale-95 ${viewMode === "playing" ? "ring-2 ring-primary/50" : ""}`}
              onClick={() => onToggleView(viewMode === "playing" ? "discover" : "playing")}
            >
              {currentTrack.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentTrack.cover}
                  alt={currentTrack.title}
                  className="h-full w-full object-cover transition-transform group-hover:blur-[2px]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-foreground/5">
                  <Music className="h-5 w-5 text-muted-foreground/50" />
                </div>
              )}
              {/* Loading overlay — sits on top of the cover while we resolve
                  the streaming URL so users see "we got your click" before
                  audio actually plays. Subscribes to AudioStateContext so it
                  updates without re-rendering this whole component. */}
              <MiniCoverLoadingOverlay />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                {viewMode === "playing" ? (
                  <SkipBack className="h-5 w-5 rotate-[-90deg] text-white" />
                ) : (
                  <SkipForward className="h-5 w-5 rotate-[-90deg] text-white" />
                )}
              </div>
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className="truncate text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors"
                onClick={() => onToggleView(viewMode === "playing" ? "discover" : "playing")}
              >
                {currentTrack.title}
              </span>
              <span className="truncate text-xs text-muted-foreground">{currentTrack.artist}</span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 opacity-50">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-foreground/5">
              <Music className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">音乐播放器</span>
              <span className="text-xs">听见好时光</span>
            </div>
          </div>
        )}
      </div>

      {/* Center: Playback Controls & Progress */}
      <div className="flex max-w-2xl flex-1 flex-col items-center justify-center gap-2 px-8">
        <div className="flex items-center gap-5">
          <button
            onClick={onPlayModeChange}
            className="group relative text-muted-foreground hover:text-primary transition-all duration-150 active:scale-90"
            title={modeConfig.label}
          >
            <ModeIcon className="h-4 w-4" />
          </button>
          <button onClick={onPrev} className="text-foreground hover:text-primary transition-all duration-150 active:scale-90" title="上一首">
            <SkipBack className="h-5 w-5" fill="currentColor" />
          </button>
          <PlayButton onPlayPause={onPlayPause} />
          <button onClick={onNext} className="text-foreground hover:text-primary transition-all duration-150 active:scale-90" title="下一首">
            <SkipForward className="h-5 w-5" fill="currentColor" />
          </button>
          <button
            onClick={() => onToggleView(viewMode === "playing" ? "discover" : "playing")}
            className={`text-muted-foreground hover:text-primary transition-all duration-150 active:scale-90 ${viewMode === "playing" ? "text-primary" : ""}`}
            title="歌词"
          >
            <Mic2 className="h-4 w-4" />
          </button>
        </div>

        {playError ? (
          <div className="flex w-full items-center justify-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            <span className="text-xs text-red-400/80 truncate">{playError}</span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex shrink-0 items-center gap-1 rounded-md bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/70 transition-all duration-150 hover:bg-white/[0.12] hover:text-white/90 active:scale-95 active:bg-white/[0.18]"
              >
                <RefreshCw className="h-3 w-3" />
                重试
              </button>
            )}
          </div>
        ) : (
          <ProgressBar onSeek={onSeek} />
        )}
      </div>

      {/* Right: Volume & Playlist Toggle */}
      <div className="flex w-[250px] shrink-0 items-center justify-end gap-5">
        <div className="flex items-center gap-2 group">
          <button
            onClick={() => onVolumeChange(volume === 0 ? 70 : 0)}
            className="text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-90"
          >
            <VolumeIcon className="h-4 w-4" />
          </button>
          <div className="w-20 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <Slider
              value={[volume]}
              max={100}
              step={1}
              onValueChange={([v]) => onVolumeChange(v)}
              className="[&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-foreground/[0.08] [&_[data-slot=slider-range]]:bg-muted-foreground [&_[data-slot=slider-thumb]]:h-2.5 [&_[data-slot=slider-thumb]]:w-2.5 [&_[data-slot=slider-thumb]]:border-muted-foreground"
            />
          </div>
        </div>
        <button
          onClick={() => onToggleView(viewMode === "playlist" ? "discover" : "playlist")}
          className={`text-muted-foreground hover:text-primary transition-all duration-150 active:scale-90 ${viewMode === "playlist" ? "text-primary bg-primary/10 rounded-md p-1.5" : "p-1.5"}`}
          title="播放列表"
        >
          <ListMusic className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
})
