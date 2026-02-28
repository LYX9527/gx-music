"use client"

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
} from "lucide-react"
import { Slider } from "@/components/ui/slider"

import { Track } from "./track-list"

export type PlayMode = "list" | "single" | "shuffle"

interface PlayerControlsProps {
  currentTrack: Track | null
  isPlaying: boolean
  onPlayPause: () => void
  onNext: () => void
  onPrev: () => void
  playMode: PlayMode
  onPlayModeChange: () => void
  volume: number
  onVolumeChange: (v: number) => void
  currentTime: number
  duration: number
  onSeek: (t: number) => void
  beatIntensity: number
  viewMode: "discover" | "playing" | "playlist"
  onToggleView: (mode: "discover" | "playing" | "playlist") => void
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

const PLAY_MODE_CONFIG: Record<PlayMode, { icon: typeof Repeat; label: string }> = {
  list: { icon: Repeat, label: "列表循环" },
  single: { icon: Repeat1, label: "单曲循环" },
  shuffle: { icon: Shuffle, label: "随机播放" },
}

export function PlayerControls({
  currentTrack,
  isPlaying,
  onPlayPause,
  onNext,
  onPrev,
  playMode,
  onPlayModeChange,
  volume,
  onVolumeChange,
  currentTime,
  duration,
  onSeek,
  beatIntensity,
  viewMode,
  onToggleView,
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
            className="group relative text-muted-foreground hover:text-primary transition-colors"
            title={modeConfig.label}
          >
            <ModeIcon className="h-4 w-4" />
          </button>
          <button onClick={onPrev} className="text-foreground hover:text-primary transition-colors" title="上一首">
            <SkipBack className="h-5 w-5" fill="currentColor" />
          </button>
          <button
            onClick={onPlayPause}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              boxShadow: isPlaying
                ? `0 0 ${15 + beatIntensity * 20}px rgba(200, 80, 60, ${0.4 + beatIntensity * 0.4})`
                : undefined,
            }}
            title={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" fill="currentColor" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" fill="currentColor" />
            )}
          </button>
          <button onClick={onNext} className="text-foreground hover:text-primary transition-colors" title="下一首">
            <SkipForward className="h-5 w-5" fill="currentColor" />
          </button>
          <button
            onClick={() => onToggleView(viewMode === "playing" ? "discover" : "playing")}
            className={`text-muted-foreground hover:text-primary transition-colors ${viewMode === "playing" ? "text-primary" : ""}`}
            title="歌词"
          >
            <Mic2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex w-full items-center gap-3">
          <span className="w-10 text-right text-[10px] tabular-nums text-muted-foreground">{formatTime(currentTime)}</span>
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={1}
            onValueChange={([v]) => onSeek(v)}
            className="flex-1 [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-foreground/[0.08] [&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-thumb]]:h-2.5 [&_[data-slot=slider-thumb]]:w-2.5 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:opacity-0 hover:[&_[data-slot=slider-thumb]]:opacity-100 focus-within:[&_[data-slot=slider-thumb]]:opacity-100 transition-opacity"
          />
          <span className="w-10 text-left text-[10px] tabular-nums text-muted-foreground">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right: Volume & Playlist Toggle */}
      <div className="flex w-[250px] shrink-0 items-center justify-end gap-5">
        <div className="flex items-center gap-2 group">
          <button
            onClick={() => onVolumeChange(volume === 0 ? 70 : 0)}
            className="text-muted-foreground hover:text-foreground transition-colors"
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
          className={`text-muted-foreground hover:text-primary transition-colors ${viewMode === "playlist" ? "text-primary bg-primary/10 rounded-md p-1.5" : "p-1.5"}`}
          title="播放列表"
        >
          <ListMusic className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
