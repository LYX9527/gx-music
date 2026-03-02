"use client"

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { ListMusic } from "lucide-react"
import { type Playlist } from "@/hooks/use-playlist-manager"

interface PlaylistSelectorProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelect: (playlist: Playlist) => void
    playlists: Playlist[]
}

export function PlaylistSelector({
    open,
    onOpenChange,
    onSelect,
    playlists,
}: PlaylistSelectorProps) {

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-white/10 text-foreground overflow-hidden p-0 rounded-2xl shadow-2xl">
                <DialogHeader className="px-6 py-4 border-b border-foreground/[0.04] shrink-0">
                    <DialogTitle className="text-sm font-semibold tracking-wider">添加到播放列表</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto px-4 py-4 min-h-0">
                    {playlists.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => {
                                onSelect(p)
                                onOpenChange(false)
                            }}
                            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-all text-foreground/80 hover:bg-foreground/[0.06] hover:text-foreground text-left"
                        >
                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground/5 shrink-0 text-muted-foreground">
                                <ListMusic className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col flex-1 min-w-0">
                                <span className="truncate">{p.name}</span>
                                <span className="text-[11px] text-muted-foreground">{p.tracks.length} 首歌曲</span>
                            </div>
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}
