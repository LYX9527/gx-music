"use client"

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
}

export function TrackList({ tracks, currentTrack, isPlaying, onTrackSelect, onTrackRemove }: TrackListProps) {
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
      {tracks.map((track, index) => {
        const isCurrent = currentTrack?.id === track.id
        return (
          <div
            key={track.id}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 ${isCurrent
                ? "bg-foreground/[0.08]"
                : "hover:bg-foreground/[0.05]"
              }`}
          >
            <div
              className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-black/20 cursor-pointer"
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
              className="flex min-w-0 flex-1 flex-col cursor-pointer"
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

            <span className="shrink-0 text-xs font-mono text-muted-foreground">
              {track.duration || "0:00"}
            </span>

            {onTrackRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTrackRemove(track);
                }}
                className="shrink-0 rounded-full p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-foreground/[0.1] hover:text-foreground group-hover:opacity-100"
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
