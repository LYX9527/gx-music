"use client"

import { useState, useCallback, useEffect } from "react"
import type { Track } from "@/components/track-list"

// Tauri imports
import { readDir } from "@tauri-apps/plugin-fs"
import { open } from "@tauri-apps/plugin-dialog"
import { convertFileSrc } from "@tauri-apps/api/core"

const LOCAL_FOLDERS_KEY = "muse_local_folders"
const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".flac", ".wav", ".ogg", ".aac"]

const parseFilename = (filename: string): { title: string; artist: string } => {
    const name = filename.replace(/\.[^.]+$/, "")
    const parts = name.split(" - ")
    if (parts.length >= 2) {
        return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() }
    }
    return { title: name.trim(), artist: "未知艺术家" }
}

/**
 * Hook for scanning local folders for audio files.
 * Supports multiple folder sources and recursive scanning.
 */
export function useLocalScan() {
    const [localTracks, setLocalTracks] = useState<Track[]>([])
    const [isScanning, setIsScanning] = useState(false)
    const [folders, setFolders] = useState<string[]>([])

    // Restore saved folders on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(LOCAL_FOLDERS_KEY)
            if (saved) {
                const parsed: string[] = JSON.parse(saved)
                if (parsed.length > 0) {
                    setFolders(parsed)
                    scanDirectories(parsed)
                }
            }
        } catch { }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Persist folders to localStorage
    useEffect(() => {
        localStorage.setItem(LOCAL_FOLDERS_KEY, JSON.stringify(folders))
    }, [folders])

    /**
     * Recursively scan a single directory for audio files
     */
    const scanSingleDirectory = async (dirPath: string): Promise<Track[]> => {
        const tracks: Track[] = []
        try {
            const entries = await readDir(dirPath)
            for (const entry of entries) {
                if (!entry.name) continue

                if (entry.isDirectory) {
                    // Recurse into subdirectory
                    const subTracks = await scanSingleDirectory(`${dirPath}/${entry.name}`)
                    tracks.push(...subTracks)
                    continue
                }

                const ext = entry.name.substring(entry.name.lastIndexOf(".")).toLowerCase()
                if (!AUDIO_EXTENSIONS.includes(ext)) continue

                const { title, artist } = parseFilename(entry.name)
                const filePath = `${dirPath}/${entry.name}`
                const assetUrl = convertFileSrc(filePath)

                tracks.push({
                    id: `local_${filePath}`,
                    title,
                    artist,
                    album: "本地音乐",
                    cover: "",
                    duration: "",
                    localUrl: assetUrl,
                })
            }
        } catch (e) {
            console.error(`扫描文件夹失败: ${dirPath}`, e)
        }
        return tracks
    }

    /**
     * Scan all registered directories
     */
    const scanDirectories = async (dirs: string[]) => {
        setIsScanning(true)
        try {
            const allTracks: Track[] = []
            for (const dir of dirs) {
                const tracks = await scanSingleDirectory(dir)
                allTracks.push(...tracks)
            }
            // Deduplicate by id and sort by title
            const unique = Array.from(new Map(allTracks.map((t) => [t.id, t])).values())
            unique.sort((a, b) => a.title.localeCompare(b.title))
            setLocalTracks(unique)
        } catch (e) {
            console.error("扫描本地文件夹失败:", e)
            setLocalTracks([])
        } finally {
            setIsScanning(false)
        }
    }

    /**
     * Open folder picker, add to folder list, and rescan
     */
    const addFolder = useCallback(async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: "选择音乐文件夹",
            })

            if (selected && typeof selected === "string") {
                setFolders((prev) => {
                    if (prev.includes(selected)) return prev
                    const next = [...prev, selected]
                    scanDirectories(next)
                    return next
                })
            }
        } catch (e) {
            console.error("打开文件夹选择器失败:", e)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    /**
     * Remove a folder from the scan list and rescan
     */
    const removeFolder = useCallback((folderPath: string) => {
        setFolders((prev) => {
            const next = prev.filter((f) => f !== folderPath)
            if (next.length > 0) {
                scanDirectories(next)
            } else {
                setLocalTracks([])
            }
            return next
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    /**
     * Rescan all current folders
     */
    const rescan = useCallback(async () => {
        if (folders.length > 0) {
            await scanDirectories(folders)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [folders])

    return {
        localTracks,
        isScanning,
        folders,
        addFolder,
        removeFolder,
        rescan,
    }
}
