"use client"

import type { LyricLine } from "@/components/lyrics-scroller"
export type APIResponse<T> = { code: number; data?: T; msg?: string; url?: string; lyric?: string }

// Since we separated Tauri fetching from browser fetching:
async function browserFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await fetch(endpoint, options)
    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
    }
    return await res.json() as T
}

import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

export interface OnlineSong {
    id: number
    songmid: string
    title: string
    artist: string
    album: string
    albummid: string
    coverUrl: string
}

const HEADERS = {
    Referer: 'https://y.qq.com',
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
    Cookie: 'uin=',
}

declare global {
    interface Window {
        __TAURI_INTERNALS__?: any;
        __LYRIC_DEBUG__?: string;
    }
}

// 辅助函数判断是否在 Tauri 环境中
const isTauri = () => typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined

// 通用 HTTP 请求包装，自动选择使用 Tauri HTTP (绕过 CORS) 还是浏览器 fetch
async function request(url: string, options: any = {}) {
    if (isTauri()) {
        return tauriFetch(url, options)
    }
    return fetch(url, options)
}

function decodeHtmlEntities(text: string): string {
    if (!text) return text
    return text
        .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
}

/**
 * Search songs by keyword via QQ Music API directly
 */
export async function searchMusic(
    query: string,
    page = 1
): Promise<OnlineSong[]> {
    try {
        if (isTauri()) {
            const res = await request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
                method: "POST",
                headers: { ...HEADERS, "Content-Type": "application/json" },
                body: JSON.stringify({
                    req_1: {
                        method: 'DoSearchForQQMusicDesktop',
                        module: 'music.search.SearchCgiService',
                        param: {
                            num_per_page: 20,
                            page_num: page,
                            query,
                            search_type: 0,
                        },
                    },
                }),
            })
            const data: any = await res.json()
            const songs = data?.req_1?.data?.body?.song?.list ?? []

            return songs.map((item: any) => {
                const albummid = item.albummid || (item.album && item.album.mid) || ''
                return {
                    id: item.id || item.songid,
                    songmid: item.mid || item.songmid,
                    title: item.title || item.songname,
                    artist: (item.singer || []).map((s: any) => s.name).join(' & '),
                    album: item.albumname || (item.album && item.album.title) || '未知专辑',
                    albummid,
                    coverUrl: albummid
                        ? `https://y.qq.com/music/photo_new/T002R300x300M000${albummid}.jpg`
                        : '',
                }
            })
        } else {
            // Browser fallback to Next.js API Routes
            const data = await browserFetch<APIResponse<OnlineSong[]>>("/api/music/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, page }),
            })
            if (data.code === 0 && data.data) {
                return data.data
            }
            return []
        }
    } catch (e) {
        console.error("搜索失败", e)
        return []
    }
}

/**
 * Get streaming URL for a song.
 */
export async function getMediaUrl(
    songmid: string,
    quality: "128k" | "320k" | "flac" = "128k"
): Promise<string | null> {
    try {
        if (isTauri()) {
            const res = await request(
                `https://lxmusicapi.onrender.com/url/tx/${songmid}/${quality}`,
                {
                    headers: {
                        'X-Request-Key': 'share-v3',
                        'User-Agent': 'lx-music-request/2.6.0',
                    }
                }
            )
            const data: any = await res.json()
            if (data && data.code === 0 && data.url) {
                return data.url.replace(/^http:\/\//i, 'https://')
            }
            return null
        } else {
            // Browser fallback to Next.js API Routes
            const data = await browserFetch<APIResponse<any>>(`/api/music/url?songmid=${songmid}&quality=${quality}`)
            if (data.code === 0 && data.url) {
                return data.url.replace(/^http:\/\//i, 'https://')
            }
            return null
        }
    } catch (e) {
        console.error("获取播放地址失败", e)
        return null
    }
}

/**
 * Fetch LRC lyrics and parse into LyricLine[].
 */
export async function getLyric(songmid: string): Promise<LyricLine[]> {
    try {
        let base64Lyric = ""

        if (isTauri()) {
            // Fallback to third-party or alternative API that doesn't strictly check the origin Referer for lyrics
            // We use the same 'u.y.qq.com/cgi-bin/musicu.fcg' GraphQL style endpoint which allows desktop Referers
            const url = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
            const payload = {
                "comm": { "cv": 4747474, "ct": 24, "format": "json", "inCharset": "utf-8", "outCharset": "utf-8", "notice": 0, "platform": "yqq.json", "needNewCode": 1, "uin": 0, "g_tk_new_20200303": 5381, "g_tk": 5381 },
                "req_1": {
                    "module": "music.musichallSong.PlayLyricInfo",
                    "method": "GetPlayLyricInfo",
                    "param": { "songMID": songmid, "crypt": 0 }
                }
            }
            const res = await request(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...HEADERS },
                body: JSON.stringify(payload)
            })
            const data: any = await res.json()

            const lyricData = data?.req_1?.data?.lyric ?? ""
            if (lyricData) {
                base64Lyric = lyricData
            }
        } else {
            // Browser fallback to Next.js API Routes
            const data = await browserFetch<APIResponse<any>>(`/api/music/lyric?songmid=${songmid}`)
            if (data.code === 0 && data.lyric) {
                base64Lyric = data.lyric
            }
        }

        if (base64Lyric) {
            // Base64 decode (browser native since we're client-side now)
            // Strip any invalid characters (like newlines) before atob()
            const cleanB64 = base64Lyric.replace(/\s+/g, '')
            const binStr = atob(cleanB64)
            const bytes = new Uint8Array(binStr.length)
            for (let i = 0; i < binStr.length; i++) {
                bytes[i] = binStr.charCodeAt(i)
            }
            const raw = new TextDecoder('utf-8').decode(bytes)
            const decoded = decodeHtmlEntities(raw)
            return parseLrc(decoded)
        }
        return []
    } catch (e: any) {
        console.error("歌词获取失败", e)
        return []
    }
}

/**
 * Parse LRC text into LyricLine[].
 * Format: [mm:ss.xx] lyric text
 */
function parseLrc(lrcText: string): LyricLine[] {
    const lines = lrcText.split("\n")
    const result: LyricLine[] = []

    for (const line of lines) {
        const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g
        const textContent = line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, "").trim()

        let match: RegExpExecArray | null
        while ((match = timeRegex.exec(line)) !== null) {
            const minutes = parseInt(match[1], 10)
            const seconds = parseInt(match[2], 10)
            const millisStr = match[3] || "0"
            const millis = parseInt(millisStr.padEnd(3, "0"), 10)
            const time = minutes * 60 + seconds + millis / 1000

            result.push({ time, text: textContent })
        }
    }

    result.sort((a, b) => a.time - b.time)
    return result
}
