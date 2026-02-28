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
} from "lucide-react"
import { Slider } from "@/components/ui/slider"

export type PlayMode = "list" | "single" | "shuffle"

interface PlayerControlsProps {
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
}: PlayerControlsProps) {
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2
  const modeConfig = PLAY_MODE_CONFIG[playMode]
  const ModeIcon = modeConfig.icon

  return (
    <div className="flex flex-col gap-3">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <span className="w-10 text-right text-xs font-mono text-muted-foreground">
          {formatTime(currentTime)}
        </span>
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={1}
          onValueChange={([v]) => onSeek(v)}
          className="flex-1 [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-foreground/[0.1] [&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-thumb]]:h-3 [&_[data-slot=slider-thumb]]:w-3 [&_[data-slot=slider-thumb]]:border-primary"
        />
        <span className="w-10 text-xs font-mono text-muted-foreground">
          {formatTime(duration)}
        </span>
      </div>

      {/* Controls Row - Symmetric Layout */}
      <div className="flex items-center justify-between">
        {/* Left: Volume */}
        <div className="flex w-40 items-center gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onVolumeChange(volume === 0 ? 70 : 0)}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Volume"
            >
              <VolumeIcon className="h-4 w-4" />
            </button>
            <Slider
              value={[volume]}
              max={100}
              step={1}
              onValueChange={([v]) => onVolumeChange(v)}
              className="w-20 [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-foreground/[0.1] [&_[data-slot=slider-range]]:bg-muted-foreground [&_[data-slot=slider-thumb]]:h-2.5 [&_[data-slot=slider-thumb]]:w-2.5 [&_[data-slot=slider-thumb]]:border-muted-foreground"
            />
          </div>
        </div>

        {/* Center: Playback Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            className="rounded-full p-2.5 text-foreground transition-colors hover:text-primary"
            aria-label="Previous"
          >
            <SkipBack className="h-5 w-5" fill="currentColor" />
          </button>
          <button
            onClick={onPlayPause}
            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              boxShadow: isPlaying
                ? `0 0 ${20 + beatIntensity * 20}px rgba(200, 80, 60, ${0.3 + beatIntensity * 0.3})`
                : undefined,
            }}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" fill="currentColor" />
            ) : (
              <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
            )}
          </button>
          <button
            onClick={onNext}
            className="rounded-full p-2.5 text-foreground transition-colors hover:text-primary"
            aria-label="Next"
          >
            <SkipForward className="h-5 w-5" fill="currentColor" />
          </button>
        </div>

        {/* Right: Play Mode (cycles list -> single -> shuffle) */}
        <div className="flex w-40 items-center justify-end">
          <button
            onClick={onPlayModeChange}
            className="group relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-primary transition-colors hover:bg-foreground/[0.06]"
            aria-label={modeConfig.label}
          >
            <ModeIcon className="h-4 w-4" />
            <span className="text-xs font-medium">{modeConfig.label}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
