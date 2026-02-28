"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Search, Compass, ListMusic, Music } from "lucide-react"
import { MacOSWindowControls } from "./macos-window-controls"
import { AlbumArtwork } from "./album-artwork"
import { AudioVisualizer } from "./audio-visualizer"
import { PlayerControls, type PlayMode } from "./player-controls"
import { LyricsScroller, type LyricLine } from "./lyrics-scroller"
import { SearchPanel } from "./search-panel"
import { useImageColors } from "@/hooks/use-image-colors"
import { useAudioPlayer } from "@/hooks/use-audio-player"
import { getMediaUrl, getLyric, type OnlineSong } from "@/hooks/use-online-music"
import { TrackList, type Track } from "./track-list" // Keep this import for TrackList component

const PLAYLIST_STORAGE_KEY = "muse_playlist"
const PLAYBACK_STATE_KEY = "muse_playback_state"

type ViewMode = "discover" | "playing" | "playlist"

export function MusicPlayer() {
  const [playlist, setPlaylist] = useState<Track[]>([])
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [lyricsData, setLyricsData] = useState<LyricLine[]>([])
  // viewMode controls the main content area display
  const [viewMode, setViewMode] = useState<ViewMode>("discover")
  const [showSearch, setShowSearch] = useState(false)
  const [volume, setVolume] = useState(100)
  const [playMode, setPlayMode] = useState<PlayMode>("list")

  // Load playlist from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PLAYLIST_STORAGE_KEY)
      if (saved) {
        setPlaylist(JSON.parse(saved))
      }
    } catch (e) {
      console.error("Failed to load playlist", e)
    }
  }, [])

  // Save playlist to localStorage whenever it changes
  useEffect(() => {
    if (playlist.length > 0) {
      localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(playlist))
    } else {
      localStorage.removeItem(PLAYLIST_STORAGE_KEY)
    }
  }, [playlist])


  // Image colors extraction for ambient background
  const imageColors = useImageColors(currentTrack?.cover || "")

  // We need a ref to handleNext to break the dependency cycle with useAudioPlayer
  const handleNextRef = useRef<() => void>(() => { })

  const player = useAudioPlayer({
    onEnded: () => handleNextRef.current(),
  })

  // Save playback state periodically (current track + progress)
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentTrack && player.currentTime > 0) {
        localStorage.setItem(PLAYBACK_STATE_KEY, JSON.stringify({
          track: currentTrack,
          time: player.currentTime,
        }))
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [currentTrack, player.currentTime])

  // Restore last playback state on mount
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      const raw = localStorage.getItem(PLAYBACK_STATE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (saved?.track?.songmid) {
        setCurrentTrack(saved.track)
        // Load the track without auto-playing, then seek to saved progress
        getMediaUrl(saved.track.songmid).then((url) => {
          if (!url) return
          player.loadUrl(url).then(() => {
            if (saved.time > 0) {
              player.seek(saved.time)
            }
            getLyric(saved.track.songmid).then(setLyricsData)
            player.updateMediaSession(saved.track)
          })
        })
      }
    } catch (e) {
      console.error("Failed to restore playback state", e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Previous Track Logic
  const handlePrev = useCallback(() => {
    if (playlist.length === 0 || !currentTrack) return
    let idx = playlist.findIndex((t) => t.id === currentTrack.id)
    if (playMode === "shuffle") {
      idx = Math.floor(Math.random() * playlist.length)
    } else {
      idx = idx - 1 < 0 ? playlist.length - 1 : idx - 1
    }
    playTrack(playlist[idx])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, playlist, playMode])

  // Next Track Logic
  const handleNext = useCallback(() => {
    if (playlist.length === 0 || !currentTrack) return
    let idx = playlist.findIndex((t) => t.id === currentTrack.id)
    if (playMode === "shuffle") {
      idx = Math.floor(Math.random() * playlist.length)
    } else if (playMode === "single") {
      // Replay same
    } else {
      idx = (idx + 1) % playlist.length
    }
    playTrack(playlist[idx])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, playlist, playMode])

  // Update ref whenever handleNext changes
  useEffect(() => {
    handleNextRef.current = handleNext
  }, [handleNext])

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

      // Update macOS Control Center Now Playing Metadata
      player.updateMediaSession(track)

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
      album: song.album || "Unknown Album",
      cover: song.coverUrl || "",
      duration: song.duration,
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
        album: song.album || "Unknown Album",
        cover: song.coverUrl || "",
        duration: song.duration,
      }
      setPlaylist((prev) => [...prev, track!])
    }

    playTrack(track)
    setShowSearch(false)
    setViewMode("playing")
  }

  const handleVolumeChange = (v: number) => {
    setVolume(v)
    player.setVolume(v)
  }

  // Register Global Media Session next/prev actions
  // (We use a ref internally inside use-audio-player for pause/play, but here we can safely attach the next/prev handlers because we have the playlist context)
  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("previoustrack", handlePrev)
      navigator.mediaSession.setActionHandler("nexttrack", handleNext)
    }
  }, [playlist, currentTrack, playMode]) // Added deps rather than handlePrev/handleNext directly based on the outer scope changes

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

        {/* Title Bar - Completely transparent dragging region to let macOS center its title perfectly */}
        <div data-tauri-drag-region className="relative z-10 flex h-10 shrink-0 w-full select-none cursor-default items-center justify-end px-4">
          <div data-tauri-drag-region className="absolute inset-0" />
          <div className="flex items-center relative z-20">
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.12] mr-2 text-white/80"
            >
              <Search className="h-3.5 w-3.5" />
              搜索
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="relative z-10 flex min-h-0 flex-1 bg-black/5 overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-[200px] flex shrink-0 flex-col border-r border-foreground/[0.04] px-4 py-5 z-20 bg-background/20 backdrop-blur-xl">
            <div className="mb-3 pl-2 text-[11px] font-bold tracking-widest text-muted-foreground/70">在线音乐</div>
            <nav className="flex flex-col gap-1.5 mb-8">
              <button
                onClick={() => setViewMode("discover")}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${viewMode === "discover" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
                  }`}
              >
                <Compass className="h-4 w-4" />
                发现音乐
              </button>
            </nav>

            <div className="mb-3 pl-2 text-[11px] font-bold tracking-widest text-muted-foreground/70">我的音乐</div>
            <nav className="flex flex-col gap-1.5">
              <button
                onClick={() => setViewMode("playlist")}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${viewMode === "playlist" ? "bg-foreground/[0.08] text-foreground" : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
                  }`}
              >
                <ListMusic className="h-4 w-4" />
                播放列表
              </button>
            </nav>
          </div>

          {/* Right Main Content */}
          <div className="relative flex-1 overflow-hidden z-10">
            {/* View: Discover */}
            <div
              className={`absolute inset-0 transition-all duration-700 ease-out overflow-y-auto ${viewMode === "discover" ? "opacity-100 pointer-events-auto translate-y-0" : "opacity-0 pointer-events-none translate-y-4"}`}
            >
              <div className="flex flex-col items-center justify-center p-8 min-h-full py-20">
                <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-primary/20 mb-6 shadow-2xl shadow-primary/10">
                  <Compass className="h-10 w-10 text-primary" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-white mb-4">发现每日好音乐</h2>
                <p className="max-w-md text-center text-muted-foreground mb-8 text-[15px] leading-relaxed">
                  在这里探寻海量曲库，寻找最适合你现在心情的那首歌。<br />点击下方按钮开启你的音乐之旅。
                </p>
                <button
                  onClick={() => setShowSearch(true)}
                  className="flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_rgba(200,80,60,0.3)] transition-transform hover:scale-105 active:scale-95"
                >
                  <Search className="h-4 w-4" />
                  搜索全网音乐
                </button>
              </div>
            </div>

            {/* View: Playlist */}
            <div
              className={`absolute inset-0 transition-all duration-700 ease-out overflow-y-auto ${viewMode === "playlist" ? "opacity-100 pointer-events-auto translate-y-0" : "opacity-0 pointer-events-none translate-y-4"}`}
            >
              <div className="p-10 max-w-4xl mx-auto h-full flex flex-col pb-24">
                <div className="mb-6 flex items-end justify-between border-b border-foreground/[0.04] pb-5 shrink-0">
                  <div>
                    <h2 className="text-[28px] font-bold tracking-tight text-white mb-2">默认列表</h2>
                    <p className="text-[13px] font-medium text-muted-foreground">共计 {playlist.length} 首歌曲</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 pr-2">
                  <TrackList
                    tracks={playlist}
                    currentTrack={currentTrack}
                    isPlaying={player.isPlaying}
                    onTrackSelect={handleTrackSelect}
                    onTrackRemove={handleTrackRemove}
                    frequencyData={player.frequencyData}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* View: Playing (Full Overlay over Sidebar and Main Content) */}
          <div
            className={`absolute inset-0 z-40 flex bg-background/95 backdrop-blur-3xl transition-all duration-700 ease-out overflow-hidden ${viewMode === "playing" ? "opacity-100 pointer-events-auto scale-100" : "opacity-0 pointer-events-none scale-[0.98]"}`}
          >
            {/* Left Cover & Visualizer */}
            <div className="flex w-[480px] shrink-0 flex-col items-center justify-center px-12 pt-4 pb-12">
              {currentTrack ? (
                <>
                  <div className="w-full max-w-[320px]">
                    <AlbumArtwork
                      src={currentTrack.cover}
                      alt={currentTrack.title}
                      isPlaying={player.isPlaying}
                      beatIntensity={player.beatIntensity}
                    />
                  </div>
                  {/* Visualizer */}
                  <div className="mt-10 h-14 w-full max-w-[320px]">
                    <AudioVisualizer
                      isPlaying={player.isPlaying}
                      beatIntensity={player.beatIntensity}
                      frequencyData={player.frequencyData}
                    />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-5 text-white/30">
                  <div className="flex h-36 w-36 items-center justify-center rounded-[2.5rem] bg-white/5 shadow-inner">
                    <Music className="h-12 w-12 opacity-40" />
                  </div>
                  <p className="text-sm tracking-widest uppercase font-medium">暂无播放记录</p>
                </div>
              )}
            </div>

            {/* Right Lyrics */}
            <div className="flex flex-1 flex-col px-12 pt-20 pb-12 overflow-hidden border-l border-foreground/[0.04]">
              {currentTrack && (
                <div className="mb-8 flex flex-col justify-end h-[80px] shrink-0 text-center">
                  <h2 className="text-[28px] font-bold text-[#f5f5f7] truncate pb-1.5">{currentTrack.title}</h2>
                  <p className="text-sm font-medium text-muted-foreground truncate">{currentTrack.artist} &mdash; {currentTrack.album}</p>
                </div>
              )}

              <div className="relative min-h-0 flex-1">
                {lyricsData.length > 0 ? (
                  <LyricsScroller
                    lyrics={lyricsData}
                    currentTime={player.currentTime}
                    isPlaying={player.isPlaying}
                    beatIntensity={player.beatIntensity}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground p-4">
                    <p className="text-sm">{currentTrack ? "暂未收录歌词" : ""}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Controls */}
        <PlayerControls
          currentTrack={currentTrack}
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
          viewMode={viewMode}
          onToggleView={(mode) => setViewMode(mode)}
        />
      </div>
    </div>
  )
}
