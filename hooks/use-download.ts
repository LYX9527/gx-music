"use client"

import { useState, useEffect, useCallback } from "react"
import { getMediaUrl, getLyric } from "./use-online-music"
import type { Track } from "@/components/track-list"
import { toast } from "sonner"

import { writeFile, exists, mkdir, readDir, BaseDirectory } from "@tauri-apps/plugin-fs"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { appDataDir, join } from "@tauri-apps/api/path"
import { convertFileSrc } from "@tauri-apps/api/core"

const DOWNLOAD_DIR = "MusePlayer/downloads"

/**
 * Hook for downloading songs (audio + lyrics) to local storage.
 * Returns downloaded song IDs, download function, and loading state.
 */
export function useDownload() {
    const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set())
    const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())

    // Scan existing downloads on mount
    useEffect(() => {
        scanDownloaded()
    }, [])

    const getDownloadPath = async () => {
        const base = await appDataDir()
        return await join(base, DOWNLOAD_DIR)
    }

    const scanDownloaded = async () => {
        try {
            const dir = await getDownloadPath()
            const dirExists = await exists(DOWNLOAD_DIR, { baseDir: BaseDirectory.AppData })
            if (!dirExists) return

            const entries = await readDir(DOWNLOAD_DIR, { baseDir: BaseDirectory.AppData })
            const ids = new Set<string>()
            for (const entry of entries) {
                if (entry.name?.endsWith(".mp3") || entry.name?.endsWith(".m4a")) {
                    ids.add(entry.name.replace(/\.(mp3|m4a)$/, ""))
                }
            }
            setDownloadedIds(ids)
        } catch (e) {
            console.error("扫描下载目录失败:", e)
        }
    }

    const download = useCallback(async (track: Track): Promise<boolean> => {
        const songmid = track.songmid
        if (!songmid) return false

        setDownloadingIds(prev => new Set(prev).add(songmid))

        try {
            // Ensure base AppData directory and download directory exist
            const dirExists = await exists(DOWNLOAD_DIR, { baseDir: BaseDirectory.AppData })
            if (!dirExists) {
                try {
                    await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true })
                } catch (e) { /* ignore if base exists */ }

                await mkdir(DOWNLOAD_DIR, { baseDir: BaseDirectory.AppData, recursive: true })
            }

            // 1. Download audio file via Tauri to bypass browser cross-origin limits natively
            const url = await getMediaUrl(songmid)
            if (!url) {
                toast.error("下载失败：无法获取播放地址")
                return false
            }

            const audioRes = await tauriFetch(url, {
                headers: {
                    'Referer': 'https://y.qq.com',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                }
            })

            if (!audioRes.ok) {
                throw new Error(`网络请求失败: ${audioRes.status} ${audioRes.statusText}`)
            }

            const audioBuffer = await audioRes.arrayBuffer()
            const audioData = new Uint8Array(audioBuffer)

            await writeFile(
                `${DOWNLOAD_DIR}/${songmid}.mp3`,
                audioData,
                { baseDir: BaseDirectory.AppData }
            )

            // 2. Download lyrics
            const lyrics = await getLyric(songmid)
            if (lyrics.length > 0) {
                // Convert back to LRC format
                const lrcText = lyrics.map(l => {
                    const min = Math.floor(l.time / 60)
                    const sec = Math.floor(l.time % 60)
                    const ms = Math.floor((l.time % 1) * 100)
                    return `[${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}]${l.text}`
                }).join('\n')

                const lrcData = new TextEncoder().encode(lrcText)
                await writeFile(
                    `${DOWNLOAD_DIR}/${songmid}.lrc`,
                    lrcData,
                    { baseDir: BaseDirectory.AppData }
                )
            }

            // 3. Save track metadata as JSON
            const metaData = new TextEncoder().encode(JSON.stringify(track))
            await writeFile(
                `${DOWNLOAD_DIR}/${songmid}.json`,
                metaData,
                { baseDir: BaseDirectory.AppData }
            )

            // Update downloaded set
            setDownloadedIds(prev => new Set(prev).add(songmid))
            toast.success(`已下载：${track.title}`)
            return true
        } catch (e: any) {
            console.error("下载异常完整信息:", e)
            let errDetail = e?.message || e?.toString() || "未知错误";
            if (typeof e === "object") {
                try {
                    errDetail = JSON.stringify(e, Object.getOwnPropertyNames(e));
                } catch { }
            }
            toast.error(`下载失败：${track.title}\n${errDetail}`)

            // Save log to AppData for analysis
            try {
                const logData = new TextEncoder().encode(`[${new Date().toISOString()}] Download failed for ${track.title} (${songmid}):\n${errDetail}\n\n`);
                await writeFile(`download_error.log`, logData, { baseDir: BaseDirectory.AppData, append: true });
            } catch (logErr) {
                console.error("Failed to write log", logErr)
            }

            return false
        } finally {
            setDownloadingIds(prev => {
                const next = new Set(prev)
                next.delete(songmid!)
                return next
            })
        }
    }, [])

    /**
     * Get local file URL for a downloaded song (for offline playback).
     * Returns null if not downloaded.
     */
    const getLocalUrl = useCallback(async (songmid: string): Promise<string | null> => {
        try {
            const fileExists = await exists(`${DOWNLOAD_DIR}/${songmid}.mp3`, { baseDir: BaseDirectory.AppData })
            if (!fileExists) return null
            const base = await appDataDir()
            const filePath = await join(base, DOWNLOAD_DIR, `${songmid}.mp3`)
            return convertFileSrc(filePath)
        } catch {
            return null
        }
    }, [])

    /**
     * Load lyrics from local LRC file.
     */
    const getLocalLyrics = useCallback(async (songmid: string) => {
        try {
            const { readTextFile } = await import("@tauri-apps/plugin-fs")
            const fileExists = await exists(`${DOWNLOAD_DIR}/${songmid}.lrc`, { baseDir: BaseDirectory.AppData })
            if (!fileExists) return null
            const lrcText = await readTextFile(`${DOWNLOAD_DIR}/${songmid}.lrc`, { baseDir: BaseDirectory.AppData })
            // Parse LRC
            const lines = lrcText.split("\n")
            const result: { time: number; text: string }[] = []
            for (const line of lines) {
                const match = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/.exec(line)
                if (match) {
                    const min = parseInt(match[1])
                    const sec = parseInt(match[2])
                    const ms = parseInt((match[3] || "0").padEnd(3, "0"))
                    result.push({ time: min * 60 + sec + ms / 1000, text: match[4].trim() })
                }
            }
            result.sort((a, b) => a.time - b.time)
            return result
        } catch {
            return null
        }
    }, [])

    return {
        downloadedIds,
        downloadingIds,
        download,
        getLocalUrl,
        getLocalLyrics,
        rescan: scanDownloaded,
    }
}
