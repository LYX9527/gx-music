"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Search, X, Play, ListPlus, Loader2, Music, CheckCheck } from "lucide-react"
import { searchMusic, type OnlineSong } from "@/hooks/use-online-music"
import { toast } from "sonner"

interface SearchPanelProps {
    open: boolean
    onClose: () => void
    onPlay: (song: OnlineSong) => void
    onAddToPlaylist: (song: OnlineSong) => void
}

export function SearchPanel({
    open,
    onClose,
    onPlay,
    onAddToPlaylist,
}: SearchPanelProps) {
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<OnlineSong[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [loadingSongMid, setLoadingSongMid] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)

    // Auto-focus when panel opens
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }, [open])

    const doSearch = useCallback(async () => {
        const q = query.trim()
        if (!q) return
        setIsSearching(true)
        setErrorMsg("")
        setResults([])
        try {
            const songs = await searchMusic(q)
            setResults(songs)
            if (songs.length === 0) {
                setErrorMsg("未找到相关歌曲")
            }
        } catch {
            setErrorMsg("搜索失败，请稍后重试")
        }
        setIsSearching(false)
    }, [query])

    const handlePlay = useCallback(
        async (song: OnlineSong) => {
            setLoadingSongMid(song.songmid)
            setErrorMsg("")
            try {
                await onPlay(song)
            } catch {
                setErrorMsg("播放失败")
            }
            setLoadingSongMid(null)
        },
        [onPlay]
    )

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") doSearch()
        if (e.key === "Escape") onClose()
    }

    // Animation state
    const [visible, setVisible] = useState(false)
    const [animating, setAnimating] = useState(false)

    useEffect(() => {
        if (open) {
            setVisible(true)
            // Start enter animation next frame
            requestAnimationFrame(() => setAnimating(true))
        } else {
            setAnimating(false)
            // Wait for exit animation to finish before unmount
            const timer = setTimeout(() => setVisible(false), 200)
            return () => clearTimeout(timer)
        }
    }, [open])

    if (!visible) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{
                background: animating ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0)",
                backdropFilter: animating ? "blur(20px)" : "blur(0px)",
                WebkitBackdropFilter: animating ? "blur(20px)" : "blur(0px)",
                transition: "background 0.25s ease, backdrop-filter 0.25s ease, -webkit-backdrop-filter 0.25s ease",
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div
                className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.08]"
                style={{
                    maxHeight: "75vh",
                    background:
                        "linear-gradient(135deg, rgba(22,22,36,0.98) 0%, rgba(14,14,26,0.99) 100%)",
                    boxShadow:
                        "0 25px 50px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
                    transform: animating ? "scale(1) translateY(0)" : "scale(0.92) translateY(12px)",
                    opacity: animating ? 1 : 0,
                    transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease",
                }}
            >
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
                    <div className="flex items-center gap-2 text-white/70">
                        <Search className="h-4 w-4" />
                        <span className="text-sm font-medium tracking-wider">
                            在线搜索
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full p-1.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Search input */}
                <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.04] px-5 py-3">
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        type="text"
                        placeholder="搜索歌曲名、歌手..."
                        className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
                    />
                    <button
                        onClick={doSearch}
                        disabled={isSearching || !query.trim()}
                        className="flex items-center gap-1.5 rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-white/80 transition-all hover:bg-white/[0.12] disabled:opacity-40"
                    >
                        {isSearching ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            "搜索"
                        )}
                    </button>
                </div>

                {/* Error */}
                {errorMsg && (
                    <div className="shrink-0 px-5 py-2 text-xs text-red-400/80">
                        {errorMsg}
                    </div>
                )}

                {/* Results */}
                <div className="flex-1 overflow-y-auto px-2 py-2">
                    {/* Batch Actions Header (only show when there are results) */}
                    {results.length > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 mb-1 border-b border-white/[0.04] shrink-0">
                            <span className="text-xs text-white/40">找到 {results.length} 首单曲</span>
                            <button
                                onClick={() => {
                                    results.forEach(onAddToPlaylist)
                                    toast.success(`成功添加 ${results.length} 首歌曲至列表`)
                                }}
                                className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
                            >
                                <CheckCheck className="h-3.5 w-3.5" />
                                批量添加
                            </button>
                        </div>
                    )}

                    {results.length === 0 && !isSearching && !errorMsg && (
                        <div className="flex h-32 items-center justify-center text-white/20">
                            <p className="text-sm">输入关键词搜索在线音乐</p>
                        </div>
                    )}

                    {results.map((song) => (
                        <div
                            key={song.songmid}
                            className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all hover:bg-white/[0.05]"
                        >
                            {/* Cover */}
                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white/[0.04]">
                                {song.coverUrl ? (
                                    <img
                                        src={song.coverUrl}
                                        alt=""
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-white/10">
                                        <Music className="h-4 w-4" />
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm font-medium text-white/85">
                                    {song.title}
                                </span>
                                <span className="truncate text-xs text-white/40">
                                    {song.artist} · {song.album}
                                </span>
                            </div>

                            {/* Actions */}
                            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                    onClick={() => handlePlay(song)}
                                    disabled={loadingSongMid === song.songmid}
                                    className="rounded-full p-2 text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/90"
                                    title="播放"
                                >
                                    {loadingSongMid === song.songmid ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Play className="h-4 w-4" fill="currentColor" />
                                    )}
                                </button>
                                <button
                                    onClick={() => {
                                        onAddToPlaylist(song)
                                        toast.success(`已添加《${song.title}》至播放列表`)
                                    }}
                                    className="rounded-full p-2 text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/90"
                                    title="加入播放列表"
                                >
                                    <ListPlus className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
