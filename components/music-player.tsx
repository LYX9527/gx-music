"use client"

import { useState, useCallback } from "react"
import { Music, Mic2, Search } from "lucide-react"
import { MacOSWindowControls } from "./macos-window-controls"
import { AlbumArtwork } from "./album-artwork"
import { AudioVisualizer } from "./audio-visualizer"
import { PlayerControls, type PlayMode } from "./player-controls"
import { TrackList, type Track } from "./track-list"
import { LyricsScroller, type LyricLine } from "./lyrics-scroller"
import { SearchPanel } from "./search-panel"
import { useImageColors } from "@/hooks/use-image-colors"
import { useAudioPlayer } from "@/hooks/use-audio-player"
import { getMediaUrl, getLyric, type OnlineSong } from "@/hooks/use-online-music"

type ViewMode = "lyrics" | "playlist"

export function MusicPlayer() {
  const [playlist, setPlaylist] = useState<Track[]>([])
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [playMode, setPlayMode] = useState<PlayMode>("list")
  const [volume, setVolume] = useState(70)
  const [rightPanel, setRightPanel] = useState<ViewMode>("lyrics")
  const [showSearch, setShowSearch] = useState(false)
  const [lyricsData, setLyricsData] = useState<LyricLine[]>([])

  // Image colors extraction for ambient background
  const imageColors = useImageColors(currentTrack?.cover || "")

  // Next Track Logic
  const handleNext = useCallback(() => {
    if (playlist.length === 0 || !currentTrack) return

    const idx = playlist.findIndex((t) => t.id === currentTrack.id)
    if (playMode === "single") {
      player.seek(0)
      player.play()
      return
    }

    let nextIdx = 0
    if (playMode === "shuffle") {
      nextIdx = Math.floor(Math.random() * playlist.length)
      if (nextIdx === idx && playlist.length > 1) {
        nextIdx = (nextIdx + 1) % playlist.length
      }
    } else {
      nextIdx = (idx + 1) % playlist.length
    }

    playTrack(playlist[nextIdx])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, playlist, playMode])

  // Player hook
  const player = useAudioPlayer({
    onEnded: handleNext,
  })

  // Previous Track Logic
  const handlePrev = useCallback(() => {
    if (playlist.length === 0 || !currentTrack) return

    if (player.currentTime > 3) {
      player.seek(0)
      return
    }

    if (playMode === "single") {
      player.seek(0)
      return
    }

    const idx = playlist.findIndex((t) => t.id === currentTrack.id)
    let prevIdx = 0
    if (playMode === "shuffle") {
      prevIdx = Math.floor(Math.random() * playlist.length)
    } else {
      prevIdx = (idx - 1 + playlist.length) % playlist.length
    }

    playTrack(playlist[prevIdx])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, playlist, playMode, player])

  const playTrack = async (track: Track) => {
    if (!track.songmid) return

    setCurrentTrack(track)
    setLyricsData([]) // Clear old lyrics

    try {
      // 1. Fetch streaming URL
      const url = await getMediaUrl(track.songmid)
      if (!url) {
        console.error("No play URL found")
        return
      }

      // 2. Fetch lyrics concurrently with audio loading
      getLyric(track.songmid).then(setLyricsData)

      // 3. Play audio
      await player.loadUrl(url)
      player.setVolume(volume)
      player.play()
    } catch (err) {
      console.error("Play error:", err)
    }
  }

  const handleTrackSelect = (track: Track) => {
    if (currentTrack?.id === track.id) {
      player.togglePlay()
    } else {
      playTrack(track)
    }
  }

  const handleTrackRemove = (track: Track) => {
    const newPlaylist = playlist.filter((t) => t.id !== track.id)
    setPlaylist(newPlaylist)
    if (currentTrack?.id === track.id) {
      player.pause()
      setCurrentTrack(null)
      setLyricsData([])
    }
  }

  const handleAddToPlaylist = (song: OnlineSong) => {
    if (playlist.some((t) => t.id === song.songmid)) return

    const newTrack: Track = {
      id: song.songmid,
      songmid: song.songmid,
      title: song.title,
      artist: song.artist,
      album: song.album,
      cover: song.coverUrl,
    }

    setPlaylist((prev) => [...prev, newTrack])
  }

  const handlePlayOnlineSong = (song: OnlineSong) => {
    let track = playlist.find((t) => t.id === song.songmid)
    if (!track) {
      track = {
        id: song.songmid,
        songmid: song.songmid,
        title: song.title,
        artist: song.artist,
        album: song.album,
        cover: song.coverUrl,
      }
      setPlaylist((prev) => [...prev, track!])
    }

    playTrack(track)
    setShowSearch(false)
  }

  const handleVolumeChange = (v: number) => {
    setVolume(v)
    player.setVolume(v)
  }

  // Build rgba helpers for gradient layers
  const dominantRgba = (a: number) =>
    imageColors.dominant.replace("rgb", "rgba").replace(")", `,${a})`)
  const secondaryRgba = (a: number) =>
    imageColors.secondary.replace("rgb", "rgba").replace(")", `,${a})`)
  const mutedRgba = (a: number) =>
    imageColors.muted.replace("rgb", "rgba").replace(")", `,${a})`)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#080810] font-sans">
      <SearchPanel
        open={showSearch}
        onClose={() => setShowSearch(false)}
        onPlay={handlePlayOnlineSong}
        onAddToPlaylist={handleAddToPlaylist}
      />

      <div
        data-tauri-drag-region
        className="relative flex h-full w-full flex-col overflow-hidden"
        style={{
          background: `
            radial-gradient(ellipse at 20% 30%, ${dominantRgba(0.25)} 0%, transparent 55%),
            radial-gradient(ellipse at 80% 70%, ${secondaryRgba(0.18)} 0%, transparent 50%),
            radial-gradient(ellipse at 50% 100%, ${mutedRgba(0.15)} 0%, transparent 60%),
            linear-gradient(135deg, rgba(18,18,28,0.95) 0%, rgba(12,12,22,0.98) 100%)
          `,
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.05),
            0 25px 60px -12px rgba(0,0,0,0.7),
            0 0 100px -30px ${dominantRgba(0.25)}
          `,
          transition: "background 1.4s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 1.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 z-0 rounded-2xl"
          style={{
            background: `
              radial-gradient(ellipse at 25% 25%, ${dominantRgba(0.2)} 0%, transparent 50%),
              radial-gradient(ellipse at 75% 75%, ${secondaryRgba(0.12)} 0%, transparent 45%)
            `,
            opacity: player.isPlaying ? 0.5 + player.beatIntensity * 0.5 : 0.3,
            transition: "opacity 0.15s ease-out, background 1.4s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />

        {/* Title Bar */}
        <div data-tauri-drag-region className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-foreground/[0.06] px-5 pl-24 pt-2 select-none">
          {/* Space reserved for macOS traffic lights overlay */}
          <div data-tauri-drag-region className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-muted-foreground pointer-events-none mt-1">
            <Music className="h-3.5 w-3.5" />
            <span className="text-xs font-medium tracking-widest text-[#dcdceb]">音乐播放器</span>
          </div>
          <div className="flex-1 pointer-events-none" />
          <div className="flex items-center">
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.12]"
            >
              <Search className="h-3.5 w-3.5" />
              搜索
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="relative z-10 flex min-h-0 flex-1">
          {/* Left panel */}
          <div className="flex w-1/2 flex-col items-center justify-center px-8 py-6">
            {currentTrack ? (
              <>
                <div className="w-full max-w-[260px]">
                  <AlbumArtwork
                    src={currentTrack.cover}
                    alt={currentTrack.title}
                    isPlaying={player.isPlaying}
                    beatIntensity={player.beatIntensity}
                  />
                </div>
                <div className="mt-5 flex flex-col items-center gap-1 text-center">
                  <h2
                    className="text-lg font-semibold text-foreground transition-transform duration-150 text-[#f5f5f7]"
                    style={{ transform: player.isPlaying ? `scale(${1 + player.beatIntensity * 0.015})` : undefined }}
                  >
                    {currentTrack.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {currentTrack.artist} &mdash; {currentTrack.album}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-4 text-white/40">
                <div className="flex h-40 w-40 items-center justify-center rounded-full bg-white/5 shadow-2xl">
                  <Music className="h-12 w-12 opacity-50" />
                </div>
                <p className="text-sm">尚未选择播放的歌曲</p>
                <button
                  onClick={() => setShowSearch(true)}
                  className="rounded-full bg-white/10 px-6 py-2 text-sm text-white/80 transition-colors hover:bg-white/20"
                >
                  去搜索
                </button>
              </div>
            )}

            {/* Visualizer */}
            <div className="mt-5 h-14 w-full max-w-[280px]">
              <AudioVisualizer
                isPlaying={player.isPlaying}
                beatIntensity={player.beatIntensity}
                frequencyData={player.frequencyData}
              />
            </div>
          </div>

          {/* Right Panel */}
          <div className="flex w-1/2 flex-col border-l border-foreground/[0.06]">
            <div className="flex h-11 shrink-0 items-center justify-center border-b border-foreground/[0.04] px-4">
              <div className="flex items-center gap-0.5 rounded-lg bg-foreground/[0.06] p-0.5">
                <button
                  onClick={() => setRightPanel("lyrics")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium tracking-wide transition-all duration-300 ${rightPanel === "lyrics" ? "bg-foreground/[0.12] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <Mic2 className="h-3 w-3" />
                  <span>歌词</span>
                </button>
                <button
                  onClick={() => setRightPanel("playlist")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium tracking-wide transition-all duration-300 ${rightPanel === "playlist" ? "bg-foreground/[0.12] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <Music className="h-3 w-3" />
                  <span>播放列表</span>
                </button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1">
              <div
                className="absolute inset-0 transition-opacity duration-500"
                style={{
                  opacity: rightPanel === "lyrics" ? 1 : 0,
                  pointerEvents: rightPanel === "lyrics" ? "auto" : "none",
                  zIndex: rightPanel === "lyrics" ? 10 : 0
                }}
              >
                {lyricsData.length > 0 ? (
                  <LyricsScroller
                    lyrics={lyricsData}
                    currentTime={player.currentTime}
                    isPlaying={player.isPlaying}
                    beatIntensity={player.beatIntensity}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground p-4">
                    <p className="text-sm">{currentTrack ? "暂无歌词" : ""}</p>
                  </div>
                )}
              </div>

              <div
                className="absolute inset-0 overflow-y-auto px-2 py-2 transition-opacity duration-500"
                style={{
                  opacity: rightPanel === "playlist" ? 1 : 0,
                  pointerEvents: rightPanel === "playlist" ? "auto" : "none",
                  zIndex: rightPanel === "playlist" ? 10 : 0
                }}
              >
                <TrackList
                  tracks={playlist}
                  currentTrack={currentTrack}
                  isPlaying={player.isPlaying}
                  onTrackSelect={handleTrackSelect}
                  onTrackRemove={handleTrackRemove}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="relative z-10 shrink-0 border-t border-foreground/[0.06] px-6 py-4">
          <PlayerControls
            isPlaying={player.isPlaying}
            onPlayPause={player.togglePlay}
            onNext={handleNext}
            onPrev={handlePrev}
            playMode={playMode}
            onPlayModeChange={() => {
              setPlayMode((prev) => (prev === "list" ? "single" : prev === "single" ? "shuffle" : "list"))
            }}
            volume={volume}
            onVolumeChange={handleVolumeChange}
            currentTime={player.currentTime}
            duration={player.duration}
            onSeek={player.seek}
            beatIntensity={player.beatIntensity}
          />
        </div>
      </div>
    </div>
  )
}
