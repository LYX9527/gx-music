"use client"

import { useRef, useEffect } from "react"
import { Play, Pause, X } from "lucide-react"

export interface Track {
  id: string | number
  songmid?: string
  title: string
  artist: string
  album: string
  duration?: string
  cover: string
}

interface TrackListProps {
  tracks: Track[]
  currentTrack: Track | null
  isPlaying: boolean
  onTrackSelect: (track: Track) => void
  onTrackRemove?: (track: Track) => void
  frequencyData?: Uint8Array | null
}

/**
 * Lightweight inline rhythm bar visualizer drawn on a <canvas>.
 * Renders semi‑transparent vertical bars that bounce with the music.
 */
function InlineVisualizer({ frequencyData }: { frequencyData: Uint8Array | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const barsRef = useRef<number[]>([])
  const BAR_COUNT = 64

  useEffect(() => {
    if (barsRef.current.length === 0) {
      barsRef.current = Array.from({ length: BAR_COUNT }, () => 0)
    }
  }, [])

  // Multi-color palette: cyan → blue → violet → magenta → rose → amber
  const COLORS = [
    [0, 210, 255],   // cyan
    [99, 102, 241],  // indigo
    [168, 85, 247],  // violet
    [236, 72, 153],  // pink
    [251, 146, 60],  // amber
    [52, 211, 153],  // emerald
  ]

  function getBarColor(i: number, alpha: number): string {
    const t = i / BAR_COUNT
    const idx = t * (COLORS.length - 1)
    const lo = Math.floor(idx)
    const hi = Math.min(lo + 1, COLORS.length - 1)
    const frac = idx - lo
    const r = Math.round(COLORS[lo][0] + (COLORS[hi][0] - COLORS[lo][0]) * frac)
    const g = Math.round(COLORS[lo][1] + (COLORS[hi][1] - COLORS[lo][1]) * frac)
    const b = Math.round(COLORS[lo][2] + (COLORS[hi][2] - COLORS[lo][2]) * frac)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const tick = () => {
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)

      const w = rect.width
      const h = rect.height
      ctx.clearRect(0, 0, w, h)

      const bars = barsRef.current
      const fd = frequencyData

      // Update target bar heights from frequency data
      if (fd && fd.length > 0) {
        const step = Math.max(1, Math.floor((fd.length * 0.5) / BAR_COUNT))
        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0
          let cnt = 0
          for (let j = 0; j < step && i * step + j < fd.length; j++) {
            sum += fd[i * step + j]
            cnt++
          }
          const avg = cnt > 0 ? sum / cnt / 255 : 0
          const target = Math.pow(avg, 1.3) * 0.8
          bars[i] += (target - bars[i]) * (target > bars[i] ? 0.4 : 0.1)
        }
      } else {
        for (let i = 0; i < BAR_COUNT; i++) {
          bars[i] *= 0.88
        }
      }

      // Draw narrow bars from the bottom with multi-color gradient
      const gap = 2
      const barW = (w - gap * BAR_COUNT) / BAR_COUNT
      for (let i = 0; i < BAR_COUNT; i++) {
        const barH = Math.max(1, bars[i] * h)
        const x = i * (barW + gap)

        const gradient = ctx.createLinearGradient(x, h - barH, x, h)
        gradient.addColorStop(0, getBarColor(i, 0.4))
        gradient.addColorStop(1, getBarColor(i, 0.06))
        ctx.fillStyle = gradient

        // Rounded top via small radius
        const radius = Math.min(1.5, barW / 2)
        ctx.beginPath()
        ctx.moveTo(x + radius, h - barH)
        ctx.lineTo(x + barW - radius, h - barH)
        ctx.quadraticCurveTo(x + barW, h - barH, x + barW, h - barH + radius)
        ctx.lineTo(x + barW, h)
        ctx.lineTo(x, h)
        ctx.lineTo(x, h - barH + radius)
        ctx.quadraticCurveTo(x, h - barH, x + radius, h - barH)
        ctx.closePath()
        ctx.fill()
      }

      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [frequencyData])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  )
}

export function TrackList({ tracks, currentTrack, isPlaying, onTrackSelect, onTrackRemove, frequencyData }: TrackListProps) {
  if (tracks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <p className="text-sm">播放列表为空</p>
        <p className="text-xs opacity-60 mt-2">请点击顶部搜索按钮添加音乐</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {tracks.map((track) => {
        const isCurrent = currentTrack?.id === track.id
        const showVisualizer = isCurrent && isPlaying && frequencyData
        return (
          <div
            key={track.id}
            className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 overflow-hidden ${isCurrent
              ? "bg-foreground/[0.08]"
              : "hover:bg-foreground/[0.05]"
              }`}
          >
            {/* Inline rhythm bar background for the currently playing track */}
            {showVisualizer && (
              <InlineVisualizer frequencyData={frequencyData} />
            )}

            <div
              className="relative z-[1] h-10 w-10 shrink-0 overflow-hidden rounded-md bg-black/20 cursor-pointer"
              onClick={() => onTrackSelect(track)}
            >
              <img
                src={track.cover || '/placeholder-logo.png'}
                alt={track.title}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity ${isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}>
                {isCurrent && isPlaying ? (
                  <Pause className="h-4 w-4 text-primary-foreground" fill="currentColor" />
                ) : (
                  <Play className="h-4 w-4 text-primary-foreground" fill="currentColor" />
                )}
              </div>
            </div>

            <div
              className="relative z-[1] flex min-w-0 flex-1 flex-col cursor-pointer"
              onClick={() => onTrackSelect(track)}
            >
              <span className={`truncate text-sm font-medium ${isCurrent ? "text-primary" : "text-foreground"
                }`}>
                {track.title}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {track.artist}
              </span>
            </div>


            {onTrackRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTrackRemove(track);
                }}
                className="relative z-[1] shrink-0 rounded-full p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-foreground/[0.1] hover:text-foreground group-hover:opacity-100"
                title="从列表移除"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
