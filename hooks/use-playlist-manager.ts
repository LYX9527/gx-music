"use client"

import { useState, useEffect, useCallback } from "react"
import type { Track } from "@/components/track-list"

const PLAYLISTS_STORAGE_KEY = "muse_playlists"
const ACTIVE_PLAYLIST_KEY = "muse_active_playlist"
const OLD_PLAYLIST_STORAGE_KEY = "muse_playlist"
const DEFAULT_PLAYLIST_ID = "default"

export interface Playlist {
    id: string
    name: string
    tracks: Track[]
    createdAt: number
}

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function createDefaultPlaylist(tracks: Track[] = []): Playlist {
    return {
        id: DEFAULT_PLAYLIST_ID,
        name: "默认列表",
        tracks,
        createdAt: 0,
    }
}

/**
 * Hook for managing multiple playlists with localStorage persistence.
 * Auto-migrates from the old single-playlist format on first load.
 */
export function usePlaylistManager() {
    const [playlists, setPlaylists] = useState<Playlist[]>([createDefaultPlaylist()])
    const [activePlaylistId, setActivePlaylistId] = useState<string>(DEFAULT_PLAYLIST_ID)

    // Load playlists from localStorage on mount (with migration)
    useEffect(() => {
        try {
            const saved = localStorage.getItem(PLAYLISTS_STORAGE_KEY)
            if (saved) {
                const parsed: Playlist[] = JSON.parse(saved)
                // Ensure default playlist always exists
                if (!parsed.find((p) => p.id === DEFAULT_PLAYLIST_ID)) {
                    parsed.unshift(createDefaultPlaylist())
                }
                setPlaylists(parsed)
            } else {
                // Migrate from old single-playlist format
                const oldData = localStorage.getItem(OLD_PLAYLIST_STORAGE_KEY)
                const oldTracks: Track[] = oldData ? JSON.parse(oldData) : []
                const initial = [createDefaultPlaylist(oldTracks)]
                setPlaylists(initial)
                localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(initial))
                // Clean up old key after migration
                if (oldData) localStorage.removeItem(OLD_PLAYLIST_STORAGE_KEY)
            }

            // Restore active playlist
            const savedActive = localStorage.getItem(ACTIVE_PLAYLIST_KEY)
            if (savedActive) setActivePlaylistId(savedActive)
        } catch (e) {
            console.error("Failed to load playlists", e)
        }
    }, [])

    // Persist playlists to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists))
    }, [playlists])

    // Persist active playlist id
    useEffect(() => {
        localStorage.setItem(ACTIVE_PLAYLIST_KEY, activePlaylistId)
    }, [activePlaylistId])

    // Get the currently active playlist
    const activePlaylist = playlists.find((p) => p.id === activePlaylistId) || playlists[0]

    // Create a new playlist
    const createPlaylist = useCallback((name: string): Playlist => {
        const newPlaylist: Playlist = {
            id: generateId(),
            name,
            tracks: [],
            createdAt: Date.now(),
        }
        setPlaylists((prev) => [...prev, newPlaylist])
        return newPlaylist
    }, [])

    // Rename a playlist
    const renamePlaylist = useCallback((id: string, newName: string) => {
        if (id === DEFAULT_PLAYLIST_ID) return // Don't rename default
        setPlaylists((prev) =>
            prev.map((p) => (p.id === id ? { ...p, name: newName } : p))
        )
    }, [])

    // Delete a playlist
    const deletePlaylist = useCallback((id: string) => {
        if (id === DEFAULT_PLAYLIST_ID) return // Can't delete default
        setPlaylists((prev) => prev.filter((p) => p.id !== id))
        setActivePlaylistId((prev) => (prev === id ? DEFAULT_PLAYLIST_ID : prev))
    }, [])

    // Add a track to a specific playlist (dedup by track.id)
    const addTrackToPlaylist = useCallback((playlistId: string, track: Track) => {
        setPlaylists((prev) =>
            prev.map((p) => {
                if (p.id !== playlistId) return p
                if (p.tracks.some((t) => t.id === track.id)) return p
                return { ...p, tracks: [...p.tracks, track] }
            })
        )
    }, [])

    // Add a track to the active playlist
    const addTrackToActive = useCallback((track: Track) => {
        setPlaylists((prev) =>
            prev.map((p) => {
                if (p.id !== activePlaylistId) return p
                if (p.tracks.some((t) => t.id === track.id)) return p
                return { ...p, tracks: [...p.tracks, track] }
            })
        )
    }, [activePlaylistId])

    // Remove a track from a playlist
    const removeTrackFromPlaylist = useCallback((playlistId: string, trackId: string | number) => {
        setPlaylists((prev) =>
            prev.map((p) => {
                if (p.id !== playlistId) return p
                return { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) }
            })
        )
    }, [])

    // Set active playlist
    const setActivePlaylist = useCallback((id: string) => {
        setActivePlaylistId(id)
    }, [])

    return {
        playlists,
        activePlaylistId,
        activePlaylist,
        createPlaylist,
        renamePlaylist,
        deletePlaylist,
        addTrackToPlaylist,
        addTrackToActive,
        removeTrackFromPlaylist,
        setActivePlaylist,
    }
}
