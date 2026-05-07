"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { toast } from "sonner"
import { Search, Compass, ListMusic, Music, FolderOpen, RefreshCw, FolderPlus, Plus, MoreHorizontal, Pencil, Trash2, X } from "lucide-react"
import { MacOSWindowControls } from "./macos-window-controls"
import { AlbumArtwork } from "./album-artwork"
import { AudioVisualizer } from "./audio-visualizer"
import { PlayerControls, type PlayMode } from "./player-controls"
import { LyricsScroller, type LyricLine } from "./lyrics-scroller"
import { SearchPanel } from "./search-panel"
import { useImageColors } from "@/hooks/use-image-colors"
import { useAudioPlayer } from "@/hooks/use-audio-player"
import { getMediaUrl, getLyric, type OnlineSong } from "@/hooks/use-online-music"
import { useDownload } from "@/hooks/use-download"
import { TrackList, type Track } from "./track-list"
import { usePlaylistManager } from "@/hooks/use-playlist-manager"
import { useLocalScan } from "@/hooks/use-local-scan"
import { useTraySync } from "@/hooks/use-tray-sync"
import { useHotkeys } from "@/hooks/use-hotkeys"
import { getActiveLyric, getScrollingLyricWindow } from "@/lib/lyrics-utils"
import { AudioStateContext, BeatPulseOverlay } from "./audio-state-context"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { PlaylistSelector } from "./playlist-selector"

const PLAYBACK_STATE_KEY = "muse_playback_state"

type ViewMode = "discover" | "playing" | "playlist" | "local"
type ImagePalette = { dominant: string; secondary: string; muted: string }

export function MusicPlayer() {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [lyricsData, setLyricsData] = useState<LyricLine[]>([])
  // viewMode controls the main content area display
  const [viewMode, setViewMode] = useState<ViewMode>("discover")
  const [showSearch, setShowSearch] = useState(false)
  const [playlistSelectorTrack, setPlaylistSelectorTrack] = useState<Track | null>(null)

  // Custom dialogs to prevent AudioContext suspension
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false)
  const [createPlaylistInput, setCreatePlaylistInput] = useState("")

  const [renamePlaylistTarget, setRenamePlaylistTarget] = useState<{ id: string, name: string } | null>(null)
  const [deletePlaylistTarget, setDeletePlaylistTarget] = useState<{ id: string, name: string } | null>(null)
  const [renameInput, setRenameInput] = useState("")

  const [volume, setVolume] = useState(100)
  const [playMode, setPlayMode] = useState<PlayMode>("list")
  const [playError, setPlayError] = useState<string>("")
  /**
   * True from the moment the user clicks a track until audio actually starts
   * (or fails). Distinct from `player.isLoading` — that flips only when
   * `loadUrl` is called, but we want the spinner from the click instant
   * (before the network resolves the streaming URL).
   */
  const [isPreparingPlayback, setIsPreparingPlayback] = useState(false)

  // Which list is currently driving playback
  const [playSource, setPlaySource] = useState<"playlist" | "local">("playlist")

  // Hooks
  const { downloadedIds, downloadingIds, download, getLocalUrl, getLocalLyrics } = useDownload()
  const playlistManager = usePlaylistManager()
  const localScan = useLocalScan()

  const currentQueue = playSource === "local" ? localScan.localTracks : playlistManager.activePlaylist.tracks

  // Load playlist from localStorage on mount
  // (Removed old playlist sync as we use playlistManager now)


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

        const restoreTrack = async () => {
          // Try local file first
          const localUrl = await getLocalUrl(saved.track.songmid)
          const url = localUrl || await getMediaUrl(saved.track.songmid)
          if (!url) return

          await player.loadUrl(url)
          if (saved.time > 0) {
            player.seek(saved.time)
          }

          // Load lyrics (local first, then online)
          if (localUrl) {
            const localLyrics = await getLocalLyrics(saved.track.songmid)
            if (localLyrics) setLyricsData(localLyrics)
            else getLyric(saved.track.songmid).then(setLyricsData)
          } else {
            getLyric(saved.track.songmid).then(setLyricsData)
          }

          player.updateMediaSession(saved.track)
        }

        restoreTrack()
      }
    } catch (e) {
      console.error("Failed to restore playback state", e)
      toast.error("恢复上次播放状态失败")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Previous Track Logic
  const handlePrev = useCallback(() => {
    if (currentQueue.length === 0 || !currentTrack) return
    let idx = currentQueue.findIndex((t) => t.id === currentTrack.id)
    if (playMode === "shuffle") {
      idx = Math.floor(Math.random() * currentQueue.length)
    } else {
      idx = idx - 1 < 0 ? currentQueue.length - 1 : idx - 1
    }
    playTrack(currentQueue[idx])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, currentQueue, playMode])

  // Next Track Logic
  const handleNext = useCallback(() => {
    if (currentQueue.length === 0 || !currentTrack) return
    let idx = currentQueue.findIndex((t) => t.id === currentTrack.id)
    if (playMode === "shuffle") {
      idx = Math.floor(Math.random() * currentQueue.length)
    } else if (playMode === "single") {
      // Replay same
    } else {
      idx = (idx + 1) % currentQueue.length
    }
    playTrack(currentQueue[idx])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, currentQueue, playMode])

  // Update ref whenever handleNext changes
  useEffect(() => {
    handleNextRef.current = handleNext
  }, [handleNext])

  // Download handler
  const handleDownload = useCallback(async (track: Track) => {
    const ok = await download(track)
    if (ok) {
      toast.success(`已下载：${track.title}`)
    } else {
      toast.error(`下载失败：${track.title}`)
    }
  }, [download])

  // Track id of the most recent playTrack invocation; used to ignore stale
  // resolutions when the user rapidly clicks between tracks.
  const loadingTrackRef = useRef<string | number | null>(null)

  const playTrack = async (track: Track) => {
    if (!track.songmid && !track.localUrl) return

    // Mark this track as the in-flight one — any earlier playTrack still
    // running will bail out at its next checkpoint.
    loadingTrackRef.current = track.id

    setCurrentTrack(track)
    setLyricsData([]) // Clear old lyrics
    setPlayError("") // Clear previous error
    setIsPreparingPlayback(true)

    const isStale = () => loadingTrackRef.current !== track.id
    const finish = () => {
      if (!isStale()) setIsPreparingPlayback(false)
    }

    try {
      // Update macOS Control Center Now Playing Metadata immediately (does
      // not wait on network) so the system control center reflects the user's
      // intent before audio actually loads.
      player.updateMediaSession(track)

      // Path 1 — local-only file from useLocalScan (no songmid). Direct.
      if (track.localUrl && !track.songmid) {
        await player.loadUrl(track.localUrl)
        if (isStale()) return
        player.setVolume(volume)
        player.play()
        finish()
        return
      }

      const songmid = track.songmid!

      // Path 2 — online or downloaded online track. Fan out three independent
      // probes concurrently:
      //   • localUrl     — disk lookup for a previously downloaded copy
      //   • mediaUrl     — network call to resolve the streaming URL
      //   • lyrics       — local lyrics + online lyrics fallback
      // The audio path uses whichever URL is available first (preferring local
      // since playback starts instantly and survives offline). Lyrics are
      // applied as soon as they arrive — they don't gate audio.
      const localUrlPromise = getLocalUrl(songmid).catch(() => null)
      const mediaUrlPromise = getMediaUrl(songmid).catch(() => null)

      // Lyrics in parallel: prefer local, fall back to online.
      ;(async () => {
        try {
          const localLyrics = await getLocalLyrics(songmid).catch(() => null)
          if (isStale()) return
          if (localLyrics && localLyrics.length) {
            setLyricsData(localLyrics)
            return
          }
          const online = await getLyric(songmid).catch(() => null)
          if (isStale()) return
          if (online) setLyricsData(online)
        } catch {
          // Lyrics are non-essential; swallow.
        }
      })()

      // Resolve audio URL: local wins; otherwise wait for online.
      let audioUrl = await localUrlPromise
      if (!audioUrl) {
        audioUrl = await mediaUrlPromise
      }
      if (isStale()) return

      if (!audioUrl) {
        const msg = "获取播放地址失败，请检查网络后重试"
        setPlayError(msg)
        toast.error(msg, { description: track.title })
        finish()
        return
      }

      await player.loadUrl(audioUrl)
      if (isStale()) return

      player.setVolume(volume)
      player.play()
      finish()
    } catch (err) {
      if (isStale()) return
      console.error("Play error:", err)
      const msg = "播放失败，网络可能不稳定，请重试"
      setPlayError(msg)
      toast.error(msg, { description: track.title })
      finish()
    }
  }

  const handleTrackSelect = (track: Track, source: "playlist" | "local" = "playlist") => {
    if (currentTrack?.id === track.id) {
      player.togglePlay()
    } else {
      setPlaySource(source)
      playTrack(track)
    }
  }

  const handleTrackRemove = (track: Track) => {
    playlistManager.removeTrackFromPlaylist(playlistManager.activePlaylistId, track.id)
    if (currentTrack?.id === track.id) {
      player.pause()
      setCurrentTrack(null)
      setLyricsData([])
    }
  }

  const handleAddToPlaylistPrompt = (item: Track | OnlineSong) => {
    // Determine if it's OnlineSong by checking for coverUrl
    if ("coverUrl" in item) {
      setPlaylistSelectorTrack({
        id: item.songmid,
        songmid: item.songmid,
        title: item.title,
        artist: item.artist,
        album: item.album || "Unknown Album",
        cover: item.coverUrl || "",
        duration: item.duration,
      })
    } else {
      setPlaylistSelectorTrack(item)
    }
  }

  const handlePlayOnlineSong = (song: OnlineSong) => {
    let track = playlistManager.activePlaylist.tracks.find((t) => t.id === song.songmid)
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
      playlistManager.addTrackToActive(track)
    }

    setPlaySource("playlist")
    playTrack(track)
    setShowSearch(false)
    setViewMode("playing")
  }

  const handleVolumeChange = (v: number) => {
    setVolume(v)
    player.setVolume(v)
  }

  // Retry last failed track
  const handleRetryPlay = useCallback(() => {
    if (currentTrack) {
      playTrack(currentTrack)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack])

  // Stable callbacks for the memoized PlayerControls. The actual handler
  // logic still depends on closure state (currentTrack/currentQueue/etc),
  // so we route everything through latestRef → fixed callback. PlayerControls
  // sees the same function reference every render and memo can do its job.
  const latestHandlers = useRef({
    handlePrev,
    handleNext,
    handleRetryPlay,
    setViewMode,
    setPlayMode,
    setVolume,
    seek: player.seek,
    togglePlay: player.togglePlay,
    setPlayerVolume: player.setVolume,
  })
  latestHandlers.current = {
    handlePrev,
    handleNext,
    handleRetryPlay,
    setViewMode,
    setPlayMode,
    setVolume,
    seek: player.seek,
    togglePlay: player.togglePlay,
    setPlayerVolume: player.setVolume,
  }

  const stablePrev = useCallback(() => latestHandlers.current.handlePrev(), [])
  const stableNext = useCallback(() => latestHandlers.current.handleNext(), [])
  const stableRetry = useCallback(() => latestHandlers.current.handleRetryPlay(), [])
  const stablePlayPause = useCallback(() => latestHandlers.current.togglePlay(), [])
  const stableSeek = useCallback(
    (t: number) => latestHandlers.current.seek(t),
    []
  )
  const stableToggleView = useCallback(
    (mode: "discover" | "playing" | "playlist" | "local") =>
      latestHandlers.current.setViewMode(mode),
    []
  )
  const stableModeChange = useCallback(() => {
    latestHandlers.current.setPlayMode((prev) =>
      prev === "list" ? "single" : prev === "single" ? "shuffle" : "list"
    )
  }, [])
  const stableVolumeChange = useCallback((v: number) => {
    latestHandlers.current.setVolume(v)
    latestHandlers.current.setPlayerVolume(v)
  }, [])

  // Register Global Media Session next/prev actions
  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("previoustrack", handlePrev)
      navigator.mediaSession.setActionHandler("nexttrack", handleNext)
    }
  }, [currentQueue, currentTrack, playMode]) // Added deps rather than handlePrev/handleNext directly based on the outer scope changes

  // Volume that was active before mute, so we can restore it on unmute.
  const preMuteVolumeRef = useRef(volume)
  useEffect(() => {
    if (volume > 0) preMuteVolumeRef.current = volume
  }, [volume])

  useHotkeys({
    onPlayPause: stablePlayPause,
    onPrev: stablePrev,
    onNext: stableNext,
    onSeekBy: (delta) => {
      const t = Math.max(0, Math.min(player.duration || 0, player.currentTime + delta))
      latestHandlers.current.seek(t)
    },
    onVolumeBy: (delta) => {
      const next = Math.max(0, Math.min(100, volume + delta))
      stableVolumeChange(next)
    },
    onToggleMute: () => {
      stableVolumeChange(volume > 0 ? 0 : preMuteVolumeRef.current || 70)
    },
  })

  // Active lyric for the mini-player popover (full text — popover does its
  // own CSS truncation when the window is narrow).
  const activeLyric = useMemo(
    () => getActiveLyric(lyricsData, player.currentTime),
    [lyricsData, player.currentTime]
  )

  // Sliding window of the active lyric for the macOS status bar title.
  // We re-derive this every currentTime tick; useTraySync below dedupes on
  // change so the IPC to set_tray_title only fires when the visible slice
  // actually changes (~2 Hz typical for Chinese lyrics).
  const trayLyricSlice = useMemo(
    () =>
      getScrollingLyricWindow(lyricsData, player.currentTime, {
        windowSize: 18,
        audioDuration: player.duration,
      }),
    [lyricsData, player.currentTime, player.duration]
  )

  // Bridge to tray icon + popover window (no-op outside Tauri).
  useTraySync({
    track: currentTrack,
    isPlaying: player.isPlaying,
    currentTime: player.currentTime,
    duration: player.duration,
    activeLyric,
    trayLyricSlice,
    beatIntensity: player.beatIntensity,
    onPlayPause: player.togglePlay,
    onPrev: handlePrev,
    onNext: handleNext,
    onSeek: player.seek,
    onShowLyrics: () => setViewMode("playing"),
    onShowPlaylist: () => setViewMode("playlist"),
  })

  // Build rgba helpers for gradient layers
  const dominantRgba = (a: number) =>
    imageColors.dominant.replace("rgb", "rgba").replace(")", `,${a})`)
  const secondaryRgba = (a: number) =>
    imageColors.secondary.replace("rgb", "rgba").replace(")", `,${a})`)
  const mutedRgba = (a: number) =>
    imageColors.muted.replace("rgb", "rgba").replace(")", `,${a})`)

  /**
   * Two-layer crossfade for the ambient background.
   *
   * Animating `background: gradient(...)` directly is one of the most
   * expensive things you can transition — every frame the entire viewport
   * is repainted because gradients aren't compositable on the GPU. We
   * stamp the gradient onto a <div> (one paint, then static), and swap
   * between two such layers on track change with `transition: opacity`,
   * which the browser CAN run on the compositor at 60fps free.
   */
  const buildBackground = (palette: { dominant: string; secondary: string; muted: string }) => {
    const dom = (a: number) =>
      palette.dominant.replace("rgb", "rgba").replace(")", `,${a})`)
    const sec = (a: number) =>
      palette.secondary.replace("rgb", "rgba").replace(")", `,${a})`)
    const mut = (a: number) =>
      palette.muted.replace("rgb", "rgba").replace(")", `,${a})`)
    return `
      radial-gradient(ellipse at 20% 30%, ${dom(0.25)} 0%, transparent 55%),
      radial-gradient(ellipse at 80% 70%, ${sec(0.18)} 0%, transparent 50%),
      radial-gradient(ellipse at 50% 100%, ${mut(0.15)} 0%, transparent 60%),
      linear-gradient(135deg, rgba(18,18,28,0.95) 0%, rgba(12,12,22,0.98) 100%)
    `
  }

  // Two ping-pong layers. When the palette changes, write the new palette
  // into the inactive layer, then flip `activeLayer`. The newly active
  // layer fades to opacity:1 while the old one fades to 0.
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0)
  const [layerPalettes, setLayerPalettes] = useState<[ImagePalette, ImagePalette]>([
    imageColors,
    imageColors,
  ])
  useEffect(() => {
    setLayerPalettes((prev) => {
      const inactive = activeLayer === 0 ? 1 : 0
      const next: [ImagePalette, ImagePalette] = [prev[0], prev[1]]
      next[inactive] = imageColors
      return next
    })
    setActiveLayer((a) => (a === 0 ? 1 : 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageColors.dominant, imageColors.secondary, imageColors.muted])

  /**
   * View transition styles. We deliberately avoid `transition-all` (which
   * animates expensive properties like background and box-shadow) and use
   * a macOS-flavored cubic bezier for a snappy enter / decisive exit.
   *
   * The `visibility` transition is delayed on exit so the off-screen view
   * gets `visibility: hidden` once the fade completes — that flips it
   * out of paint / composite work entirely until it animates back in.
   */
  const viewTransition =
    "opacity .22s cubic-bezier(0.32, 0.72, 0, 1), transform .22s cubic-bezier(0.32, 0.72, 0, 1)"
  const viewTransitionExit =
    "opacity .16s cubic-bezier(0.4, 0, 1, 1), transform .16s cubic-bezier(0.4, 0, 1, 1), visibility 0s linear .16s"
  const viewActiveStyle = {
    opacity: 1,
    transform: "translateY(0)",
    visibility: "visible" as const,
    pointerEvents: "auto" as const,
    transition: viewTransition,
  }
  const viewInactiveStyle = {
    opacity: 0,
    transform: "translateY(1rem)",
    visibility: "hidden" as const,
    pointerEvents: "none" as const,
    transition: viewTransitionExit,
  }
  // The "playing" overlay scales down on exit instead of translating up.
  const playingActiveStyle = {
    opacity: 1,
    transform: "scale(1)",
    visibility: "visible" as const,
    pointerEvents: "auto" as const,
    transition: viewTransition,
  }
  const playingInactiveStyle = {
    opacity: 0,
    transform: "scale(0.98)",
    visibility: "hidden" as const,
    pointerEvents: "none" as const,
    transition: viewTransitionExit,
  }

  // Audio state for the context provider — consumers (ProgressBar /
  // PlayButton / MiniCoverLoadingOverlay) re-render at 60fps without
  // forcing PlayerControls or the whole MusicPlayer subtree to do the same.
  const audioStateValue = useMemo(
    () => ({
      currentTime: player.currentTime,
      duration: player.duration,
      beatIntensity: player.beatIntensity,
      isPlaying: player.isPlaying,
      isLoading: isPreparingPlayback || player.isLoading,
    }),
    [
      player.currentTime,
      player.duration,
      player.beatIntensity,
      player.isPlaying,
      player.isLoading,
      isPreparingPlayback,
    ]
  )

  return (
    <AudioStateContext.Provider value={audioStateValue}>
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#080810] font-sans">
      <SearchPanel
        open={showSearch}
        onClose={() => setShowSearch(false)}
        onPlay={handlePlayOnlineSong}
        onAddToPlaylist={handleAddToPlaylistPrompt}
        onDownload={handleDownload}
        downloadedIds={downloadedIds}
        downloadingIds={downloadingIds}
      />

      <div
        data-tauri-drag-region
        className="relative flex h-full w-full flex-col overflow-hidden"
        style={{
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.05),
            0 25px 60px -12px rgba(0,0,0,0.7),
            0 0 100px -30px ${dominantRgba(0.25)}
          `,
          // boxShadow change is unavoidable while the dominant color moves;
          // limit the work to the box-shadow only — gradient backgrounds
          // are handled by the two crossfading layers below.
          transition: "box-shadow 1.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* Crossfading background layers — see buildBackground / activeLayer
            comments above. They sit behind everything (z-index 0). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background: buildBackground(layerPalettes[0]),
            opacity: activeLayer === 0 ? 1 : 0,
            transition: "opacity 1.4s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background: buildBackground(layerPalettes[1]),
            opacity: activeLayer === 1 ? 1 : 0,
            transition: "opacity 1.4s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
        <BeatPulseOverlay
          dominant={imageColors.dominant}
          secondary={imageColors.secondary}
        />

        {/* Title Bar - Completely transparent dragging region to let macOS center its title perfectly */}
        <div data-tauri-drag-region className="relative z-10 flex h-10 shrink-0 w-full select-none cursor-default items-center justify-end px-4">
          <div data-tauri-drag-region className="absolute inset-0" />
          <div className="flex items-center relative z-20">
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 py-1.5 text-xs font-medium text-foreground transition-all duration-150 hover:bg-foreground/[0.12] active:scale-[0.96] active:bg-foreground/[0.18] mr-2 text-white/80"
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
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 active:scale-[0.97] ${viewMode === "discover" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground active:bg-foreground/[0.08]"
                  }`}
              >
                <Compass className="h-4 w-4" />
                发现音乐
              </button>
            </nav>

            <div className="mb-3 pl-2 text-[11px] font-bold tracking-widest text-muted-foreground/70">我的音乐</div>
            <nav className="flex flex-col gap-1.5">
              <button
                onClick={() => setViewMode("local")}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 active:scale-[0.97] ${viewMode === "local" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground active:bg-foreground/[0.08]"
                  }`}
              >
                <FolderOpen className="h-4 w-4" />
                本地音乐
              </button>
            </nav>

            <div className="mt-8 mb-3 pl-2 flex items-center justify-between text-[11px] font-bold tracking-widest text-muted-foreground/70">
              <span>创建的歌单</span>
              <button
                onClick={() => {
                  setCreatePlaylistInput("新建歌单")
                  setCreatePlaylistOpen(true)
                }}
                className="hover:text-foreground transition-all duration-150 p-1 rounded-sm hover:bg-foreground/10 active:scale-90 active:bg-foreground/15"
                title="新建歌单"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <nav className="flex flex-col gap-0.5 overflow-y-auto min-h-0 flex-1 -mx-2 px-2 pb-4">
              {playlistManager.playlists.map(p => (
                <ContextMenu key={p.id}>
                  <ContextMenuTrigger>
                    <button
                      onClick={() => {
                        playlistManager.setActivePlaylist(p.id)
                        setViewMode("playlist")
                      }}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 active:scale-[0.97] ${viewMode === "playlist" && playlistManager.activePlaylistId === p.id ? "bg-foreground/[0.08] text-foreground" : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground active:bg-foreground/[0.08]"
                        }`}
                    >
                      <ListMusic className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1 text-left">{p.name}</span>
                      {viewMode === "playlist" && playlistManager.activePlaylistId === p.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      )}
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48 bg-background/95 backdrop-blur-xl border-white/10 text-foreground">
                    <ContextMenuItem
                      onSelect={(e) => {
                        const id = p.id;
                        const name = p.name;
                        setTimeout(() => {
                          setRenameInput(name);
                          setRenamePlaylistTarget({ id, name });
                        }, 50);
                      }}
                      className="gap-2 cursor-pointer focus:bg-white/10 focus:text-white text-sm"
                      disabled={p.id === "default"}
                    >
                      <Pencil className="h-4 w-4" />重命名
                    </ContextMenuItem>
                    <ContextMenuSeparator className="bg-white/10" />
                    <ContextMenuItem
                      onSelect={(e) => {
                        const id = p.id;
                        const name = p.name;
                        setTimeout(() => {
                          setDeletePlaylistTarget({ id, name });
                        }, 50);
                      }}
                      className="text-red-400 gap-2 cursor-pointer focus:bg-red-500/20 focus:text-red-400 text-sm"
                      disabled={p.id === "default"}
                    >
                      <Trash2 className="h-4 w-4" />删除
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </nav>
          </div>

          {/* Right Main Content */}
          <div className="relative flex-1 overflow-hidden z-10">
            {/* View: Discover */}
            <div
              className="absolute inset-0 overflow-y-auto"
              style={viewMode === "discover" ? viewActiveStyle : viewInactiveStyle}
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

            {/* View: Local Music */}
            <div
              className="absolute inset-0 flex flex-col"
              style={viewMode === "local" ? viewActiveStyle : viewInactiveStyle}
            >
              <div className="p-10 max-w-4xl mx-auto h-full flex flex-col w-full pb-24">
                <div className="mb-6 flex flex-col gap-4 border-b border-foreground/[0.04] pb-5 shrink-0">
                  <div className="flex items-end justify-between">
                    <div>
                      <h2 className="text-[28px] font-bold tracking-tight text-white mb-2">本地音乐</h2>
                      <p className="text-[13px] font-medium text-muted-foreground">{localScan.localTracks.length} 首歌曲</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={localScan.addFolder}
                        className="flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 py-1.5 text-xs font-medium text-foreground transition-all duration-150 hover:bg-foreground/[0.12] active:scale-[0.96] active:bg-foreground/[0.18]"
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                        添加文件夹
                      </button>
                      <button
                        onClick={localScan.rescan}
                        disabled={localScan.isScanning || localScan.folders.length === 0}
                        className="flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 py-1.5 text-xs font-medium text-foreground transition-all duration-150 hover:bg-foreground/[0.12] active:scale-[0.96] active:bg-foreground/[0.18] disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${localScan.isScanning ? "animate-spin" : ""}`} />
                        刷新
                      </button>
                    </div>
                  </div>

                  {/* Folders List */}
                  {localScan.folders.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {localScan.folders.map(folder => (
                        <div key={folder} className="flex items-center gap-1.5 bg-background/50 border border-white/5 rounded-md px-2 py-1 text-xs text-muted-foreground">
                          <FolderOpen className="h-3 w-3" />
                          <span className="max-w-[150px] truncate" title={folder}>{folder.split(/[\\/]/).pop()}</span>
                          <button
                            onClick={() => localScan.removeFolder(folder)}
                            className="hover:text-red-400 p-0.5 rounded-sm hover:bg-white/10"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 pr-2">
                  <TrackList
                    tracks={localScan.localTracks}
                    currentTrack={currentTrack}
                    isPlaying={player.isPlaying}
                    onTrackSelect={(track) => handleTrackSelect(track, "local")}
                    frequencyData={player.frequencyData}
                    onAddToPlaylist={handleAddToPlaylistPrompt}
                    hideEmptyState={true}
                  />
                  {localScan.localTracks.length === 0 && localScan.folders.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground/5 mb-4">
                        <FolderOpen className="h-8 w-8 opacity-40" />
                      </div>
                      <p className="text-sm font-medium text-foreground/80 mb-1">未添加本地文件夹</p>
                      <p className="text-xs opacity-60">请点击右上方按钮添加包含音乐的文件夹</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* View: Playlist */}
            <div
              className="absolute inset-0 overflow-y-auto"
              style={viewMode === "playlist" ? viewActiveStyle : viewInactiveStyle}
            >
              <div className="p-10 max-w-4xl mx-auto h-full flex flex-col pb-24">
                <div className="mb-6 flex items-end justify-between border-b border-foreground/[0.04] pb-5 shrink-0">
                  <div>
                    <h2 className="text-[28px] font-bold tracking-tight text-white mb-2">{playlistManager.activePlaylist.name}</h2>
                    <p className="text-[13px] font-medium text-muted-foreground">共计 {playlistManager.activePlaylist.tracks.length} 首歌曲</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 pr-2">
                  <TrackList
                    tracks={playlistManager.activePlaylist.tracks}
                    currentTrack={currentTrack}
                    isPlaying={player.isPlaying}
                    onTrackSelect={(track) => handleTrackSelect(track, "playlist")}
                    onTrackRemove={handleTrackRemove}
                    frequencyData={player.frequencyData}
                    downloadedIds={downloadedIds}
                    downloadingIds={downloadingIds}
                    onDownload={handleDownload}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* View: Playing (Full Overlay over Sidebar and Main Content) */}
          <div
            className="absolute inset-0 z-40 flex bg-background/95 backdrop-blur-3xl overflow-hidden"
            style={viewMode === "playing" ? playingActiveStyle : playingInactiveStyle}
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
          onPlayPause={stablePlayPause}
          onNext={stableNext}
          onPrev={stablePrev}
          playMode={playMode}
          onPlayModeChange={stableModeChange}
          volume={volume}
          onVolumeChange={stableVolumeChange}
          onSeek={stableSeek}
          viewMode={viewMode}
          onToggleView={stableToggleView}
          playError={playError}
          onRetry={stableRetry}
        />

        <PlaylistSelector
          open={!!playlistSelectorTrack}
          onOpenChange={(open) => { if (!open) setPlaylistSelectorTrack(null) }}
          playlists={playlistManager.playlists}
          onSelect={(playlist) => {
            if (playlistSelectorTrack) {
              playlistManager.addTrackToPlaylist(playlist.id, playlistSelectorTrack)
            }
          }}
        />

        {/* Create Dialog */}
        <Dialog open={createPlaylistOpen} onOpenChange={setCreatePlaylistOpen}>
          <DialogContent className="sm:max-w-[400px] bg-background/95 backdrop-blur-xl border-white/10 text-foreground">
            <DialogHeader>
              <DialogTitle>新建歌单</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <input
                value={createPlaylistInput}
                onChange={(e) => setCreatePlaylistInput(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && createPlaylistInput.trim()) {
                    playlistManager.createPlaylist(createPlaylistInput.trim())
                    setCreatePlaylistOpen(false)
                  }
                }}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                placeholder="输入歌单名称..."
              />
            </div>
            <DialogFooter>
              <button
                onClick={() => setCreatePlaylistOpen(false)}
                className="rounded-md px-4 py-2 text-sm font-medium text-foreground hover:bg-white/10 active:bg-white/15 active:scale-[0.97] transition-all duration-150"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (createPlaylistInput.trim()) {
                    playlistManager.createPlaylist(createPlaylistInput.trim())
                    setCreatePlaylistOpen(false)
                  }
                }}
                disabled={!createPlaylistInput.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80 active:scale-[0.97] transition-all duration-150 disabled:opacity-50 disabled:active:scale-100"
              >
                创建
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename Dialog */}
        <Dialog open={!!renamePlaylistTarget} onOpenChange={(open) => { if (!open) setRenamePlaylistTarget(null) }}>
          <DialogContent className="sm:max-w-[400px] bg-background/95 backdrop-blur-xl border-white/10 text-foreground">
            <DialogHeader>
              <DialogTitle>重命名歌单</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <input
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameInput.trim() && renamePlaylistTarget) {
                    playlistManager.renamePlaylist(renamePlaylistTarget.id, renameInput.trim())
                    setRenamePlaylistTarget(null)
                  }
                }}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                placeholder="输入新的主列表名称..."
              />
            </div>
            <DialogFooter>
              <button
                onClick={() => setRenamePlaylistTarget(null)}
                className="rounded-md px-4 py-2 text-sm font-medium text-foreground hover:bg-white/10 active:bg-white/15 active:scale-[0.97] transition-all duration-150"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (renameInput.trim() && renamePlaylistTarget) {
                    playlistManager.renamePlaylist(renamePlaylistTarget.id, renameInput.trim())
                    setRenamePlaylistTarget(null)
                  }
                }}
                disabled={!renameInput.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80 active:scale-[0.97] transition-all duration-150 disabled:opacity-50 disabled:active:scale-100"
              >
                保存
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={!!deletePlaylistTarget} onOpenChange={(open) => { if (!open) setDeletePlaylistTarget(null) }}>
          <DialogContent className="sm:max-w-[400px] bg-background/95 backdrop-blur-xl border-white/10 text-foreground">
            <DialogHeader>
              <DialogTitle>删除歌单</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                确定要删除歌单 <span className="text-foreground font-medium">"{deletePlaylistTarget?.name}"</span> 吗？此操作无法撤销。
              </p>
            </div>
            <DialogFooter>
              <button
                onClick={() => setDeletePlaylistTarget(null)}
                className="rounded-md px-4 py-2 text-sm font-medium text-foreground hover:bg-white/10 active:bg-white/15 active:scale-[0.97] transition-all duration-150"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (deletePlaylistTarget) {
                    playlistManager.deletePlaylist(deletePlaylistTarget.id)
                    setDeletePlaylistTarget(null)
                  }
                }}
                className="rounded-md bg-red-500/80 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 active:bg-red-500/90 active:scale-[0.97] transition-all duration-150"
              >
                删除
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
    </AudioStateContext.Provider>
  )
}
