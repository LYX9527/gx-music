"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { fromByteArray } from "base64-js"
import { zzcSign } from "@jixun/qmweb-sign"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"

// ────────────────────────────────────────────────────────────────
// AG1 Encoding / Decoding
// ────────────────────────────────────────────────────────────────

const responseKey = new Uint8Array([
  122, 63, 140, 29, 94, 155, 47, 10, 108, 77, 126, 139, 31, 58, 92, 157, 14,
  43, 111, 74, 129,
])
const requestKey = new Uint8Array([
  189, 48, 95, 16, 208, 255, 116, 182, 239, 84, 218, 184, 53, 181, 225, 207,
])

async function encodeAG1Request(data: string): Promise<string> {
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)

  const textEncoder = new TextEncoder()
  const encoded = textEncoder.encode(data)

  const key = await crypto.subtle.importKey(
    "raw",
    requestKey,
    "AES-GCM",
    false,
    ["encrypt"]
  )
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  )

  const finalData = new Uint8Array(iv.length + encrypted.byteLength)
  finalData.set(iv)
  finalData.set(new Uint8Array(encrypted), iv.length)
  return fromByteArray(finalData)
}

function decodeAG1Response(data: ArrayBuffer | Uint8Array): string {
  const response = new Uint8Array(data)
  response.forEach((c, i, arr) => {
    arr[i] = c ^ responseKey[i % responseKey.length]
  })
  return new TextDecoder().decode(response)
}

// ────────────────────────────────────────────────────────────────
// QQ Music Proxy (AG1 encrypted channel)
// ────────────────────────────────────────────────────────────────

const isTauri = () =>
  typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined

async function proxyQQMusic(payloadObj: any): Promise<any> {
  const payload = JSON.stringify(payloadObj)
  const body = await encodeAG1Request(payload)
  const sign = zzcSign(payload)

  const url = `https://u6.y.qq.com/cgi-bin/musics.fcg?_=${Date.now()}&encoding=ag-1&sign=${sign}`

  let res: Response
  if (isTauri()) {
    res = await tauriFetch(url, {
      body,
      method: "POST",
      headers: {},
    })
  } else {
    res = await fetch(url, {
      body,
      method: "POST",
      headers: {},
    })
  }

  const buffer = await res.arrayBuffer()
  const respText = decodeAG1Response(buffer)
  return JSON.parse(respText)
}

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface ToplistSong {
  id: number
  songmid: string
  title: string
  artist: string
  album: string
  albumMid: string
  cover: string
  duration: string
  mediaMid: string
  rank: number
}

/** Preview song from the GetAll API — lightweight, no songmid. */
export interface ToplistPreviewSong {
  songId: number
  title: string
  artist: string
  cover: string
  rank: number
}

export interface ToplistData {
  topId: number
  title: string
  updateTime: string
  headerPic: string
  /** Full songs with songmid (loaded on demand via fetchToplistPage). */
  songs: ToplistSong[]
  /** Preview songs from the GetAll catalog (3 per toplist). */
  previewSongs: ToplistPreviewSong[]
  totalNum: number
  listenNum: number
  /** True once the first full page of songs has been fetched. */
  detailLoaded: boolean
}

export interface ToplistGroup {
  groupId: number
  groupName: string
  toplists: ToplistData[]
}

// ── Playlist types ──

export interface RecommendPlaylist {
  contentId: number
  title: string
  cover: string
  listenNum: number
  creator: string
  rcmdTemplate: string
}

export interface PlaylistDetail {
  contentId: number
  title: string
  cover: string
  desc: string
  creator: string
  creatorAvatar: string
  songs: ToplistSong[]
  totalNum: number
  detailLoaded: boolean
}

// ────────────────────────────────────────────────────────────────
// API Functions
// ────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function formatListenNum(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return n.toString()
}

/**
 * Fetch all toplist groups from QQ Music.
 * Returns the full catalog of groups + toplists with preview songs.
 */
export async function fetchAllToplistGroups(): Promise<ToplistGroup[]> {
  const res = await proxyQQMusic({
    req_1: {
      module: "music.musicToplist.Toplist",
      method: "GetAll",
      param: {},
    },
  })

  const groups: any[] = res?.req_1?.data?.group ?? []

  return groups.map((g: any) => ({
    groupId: g.groupId,
    groupName: g.groupName || `分组 ${g.groupId}`,
    toplists: (g.toplist || []).map((t: any) => {
      const previewSongs: ToplistPreviewSong[] = (t.song || []).map((s: any) => ({
        songId: s.songId,
        title: s.title || "",
        artist: s.singerName || "",
        cover: s.cover || (s.albumMid
          ? `https://y.qq.com/music/photo_new/T002R300x300M000${s.albumMid}.jpg`
          : ""),
        rank: s.rank || 0,
      }))

      return {
        topId: t.topId,
        title: t.title || "",
        updateTime: t.updateTime || t.period || "",
        headerPic:
          t.headPicUrl ||
          t.frontPicUrl ||
          t.mbFrontPicUrl ||
          (previewSongs[0]?.cover || ""),
        songs: [],
        previewSongs,
        totalNum: t.totalNum || 0,
        listenNum: t.listenNum || 0,
        detailLoaded: false,
      } as ToplistData
    }),
  }))
}

/**
 * Parse the raw API response into ToplistSong[]. Shared by initial detail load
 * and loadMore so mapping logic stays DRY.
 */
function parseSongs(
  songInfoList: any[],
  songRankList: any[],
  rankOffset: number
): ToplistSong[] {
  const rankMap = new Map<number, number>()
  songRankList.forEach((s: any) => {
    if (s.songId) rankMap.set(s.songId, s.rank ?? 0)
  })

  return songInfoList.map((info: any, idx: number) => {
    const albummid = info?.album?.pmid || info?.album?.mid || ""
    return {
      id: info.id,
      songmid: info.mid,
      title: info.title || info.name || "",
      artist: (info.singer || []).map((s: any) => s.name).join(" & "),
      album: info?.album?.title || info?.album?.name || "",
      albumMid: albummid,
      cover: albummid
        ? `https://y.qq.com/music/photo_new/T002R300x300M000${albummid}.jpg`
        : "",
      duration: formatDuration(info.interval || 0),
      mediaMid: info?.file?.media_mid || "",
      rank: rankMap.get(info.id) ?? rankOffset + idx + 1,
    }
  })
}

/** Fetch a page of songs for a toplist (with full song detail). */
export async function fetchToplistPage(
  topId: number,
  offset = 0,
  num = 20
): Promise<{
  songs: ToplistSong[]
  totalNum: number
  title: string
  updateTime: string
  headerPic: string
}> {
  const res = await proxyQQMusic({
    req_1: {
      method: "GetDetail",
      module: "musicToplist.ToplistInfoServer",
      param: {
        topid: topId,
        offset,
        num,
        period: "",
      },
    },
  })

  const d = res?.req_1?.data?.data
  if (!d) throw new Error(`Failed to fetch toplist ${topId}`)

  const songInfoList: any[] = res?.req_1?.data?.songInfoList ?? []
  const songRankList: any[] = d?.song ?? []
  const songs = parseSongs(songInfoList, songRankList, offset)

  return {
    songs,
    totalNum: d.totalNum || songs.length,
    title: d.title || `榜单 ${topId}`,
    updateTime: d.updateTime || d.period || "",
    headerPic: d.headPicUrl || d.frontPicUrl || d.mbFrontPicUrl || "",
  }
}

// ── Playlist API ──

/** Fetch hot recommended playlists. */
export async function fetchRecommendPlaylists(): Promise<RecommendPlaylist[]> {
  const res = await proxyQQMusic({
    comm: { ct: 24, cv: 0 },
    req_1: {
      module: "playlist.HotRecommendServer",
      method: "get_hot_recommend",
      param: { async: 1, cmd: 2 },
    },
  })

  const list: any[] = res?.req_1?.data?.v_hot ?? []

  return list.map((item: any) => ({
    contentId: item.content_id,
    title: item.title || "",
    cover: item.cover || "",
    listenNum: item.listen_num || 0,
    creator: item.username || "",
    rcmdTemplate: item.rcmdtemplate || "",
  }))
}

/** Fetch songs from a playlist (paged). */
export async function fetchPlaylistSongs(
  disstid: number,
  offset = 0,
  num = 30
): Promise<{ songs: ToplistSong[]; totalNum: number; title: string; desc: string; cover: string; creator: string; creatorAvatar: string }> {
  const res = await proxyQQMusic({
    req_1: {
      module: "music.srfDissInfo.DissInfo",
      method: "CgiGetDiss",
      param: {
        disstid,
        dirid: 0,
        tag: true,
        song_begin: offset,
        song_num: num,
        userinfo: true,
        orderlist: true,
        onlysonglist: false,
      },
    },
  })

  const data = res?.req_1?.data
  if (!data || data.code !== 0) throw new Error(`Failed to fetch playlist ${disstid}`)

  const songlist: any[] = data.songlist || []
  // songlist format is identical to songInfoList — reuse parseSongs
  const songs = parseSongs(songlist, [], offset)

  const dirinfo = data.dirinfo || {}

  return {
    songs,
    totalNum: data.songlist_size || dirinfo.songnum || songs.length,
    title: dirinfo.title || "",
    desc: dirinfo.desc || "",
    cover: dirinfo.picurl || "",
    creator: dirinfo.creator?.nick || dirinfo.host_nick || "",
    creatorAvatar: dirinfo.creator?.headurl || dirinfo.headurl || "",
  }
}

// ────────────────────────────────────────────────────────────────
// React Hook
// ────────────────────────────────────────────────────────────────

/** Per-page size when loading more songs on scroll. */
const LOAD_MORE_PAGE_SIZE = 20
/** Number of songs for the first detail fetch. */
const INITIAL_DETAIL_SIZE = 10

export { formatListenNum }

export function useRecommend() {
  const [groups, setGroups] = useState<ToplistGroup[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>("")

  // Per-toplist: currently loading detail / more?
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set())
  // Per-toplist: all songs loaded (offset >= totalNum)?
  const [exhaustedIds, setExhaustedIds] = useState<Set<number>>(new Set())

  // ── Playlist state ──
  const [playlists, setPlaylists] = useState<RecommendPlaylist[]>([])
  const [playlistDetails, setPlaylistDetails] = useState<Map<number, PlaylistDetail>>(new Map())

  // Prevent double-load in strict mode
  const loadedRef = useRef(false)

  // ── Helper: update a specific toplist across all groups ──
  const updateToplist = useCallback(
    (topId: number, updater: (t: ToplistData) => ToplistData) => {
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          toplists: g.toplists.map((t) =>
            t.topId === topId ? updater(t) : t
          ),
        }))
      )
    },
    []
  )

  // ── Helper: find a toplist across all groups ──
  const findToplist = useCallback(
    (topId: number): ToplistData | undefined => {
      for (const g of groups) {
        const t = g.toplists.find((t) => t.topId === topId)
        if (t) return t
      }
      return undefined
    },
    [groups]
  )

  // ── Initial load: fetch all toplist groups + playlists (catalog) ──
  const load = useCallback(async () => {
    setIsLoading(true)
    setError("")
    setExhaustedIds(new Set())
    setLoadingIds(new Set())
    setPlaylistDetails(new Map())
    try {
      const [groupsResult, playlistsResult] = await Promise.allSettled([
        fetchAllToplistGroups(),
        fetchRecommendPlaylists(),
      ])
      if (groupsResult.status === "fulfilled") setGroups(groupsResult.value)
      if (playlistsResult.status === "fulfilled") setPlaylists(playlistsResult.value)
      if (groupsResult.status === "rejected" && playlistsResult.status === "rejected") {
        throw groupsResult.reason
      }
    } catch (e: any) {
      setError(e?.message || "加载推荐内容失败")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    load()
  }, [load])

  const refresh = useCallback(() => {
    loadedRef.current = false
    load()
  }, [load])

  /**
   * Load the first page of full song details for a toplist.
   * Called when a user expands a toplist for the first time.
   */
  const loadDetail = useCallback(
    async (topId: number) => {
      const toplist = findToplist(topId)
      if (!toplist || toplist.detailLoaded || loadingIds.has(topId)) return

      setLoadingIds((prev) => new Set(prev).add(topId))

      try {
        const page = await fetchToplistPage(topId, 0, INITIAL_DETAIL_SIZE)

        updateToplist(topId, (t) => ({
          ...t,
          songs: page.songs,
          totalNum: page.totalNum,
          detailLoaded: true,
        }))

        if (page.songs.length >= page.totalNum) {
          setExhaustedIds((prev) => new Set(prev).add(topId))
        }
      } catch (e) {
        console.error(`Failed to load detail for toplist ${topId}:`, e)
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev)
          next.delete(topId)
          return next
        })
      }
    },
    [findToplist, loadingIds, updateToplist]
  )

  /**
   * Load the next page of songs for a specific toplist.
   * Appends results to the existing songs array.
   */
  const loadMore = useCallback(
    async (topId: number) => {
      if (loadingIds.has(topId) || exhaustedIds.has(topId)) return

      const toplist = findToplist(topId)
      if (!toplist || !toplist.detailLoaded) return

      setLoadingIds((prev) => new Set(prev).add(topId))

      try {
        const offset = toplist.songs.length
        const page = await fetchToplistPage(topId, offset, LOAD_MORE_PAGE_SIZE)

        updateToplist(topId, (t) => ({
          ...t,
          songs: [...t.songs, ...page.songs],
          totalNum: page.totalNum,
        }))

        const newTotal = toplist.songs.length + page.songs.length
        if (
          page.songs.length < LOAD_MORE_PAGE_SIZE ||
          newTotal >= page.totalNum
        ) {
          setExhaustedIds((prev) => new Set(prev).add(topId))
        }
      } catch (e) {
        console.error(`Failed to load more for toplist ${topId}:`, e)
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev)
          next.delete(topId)
          return next
        })
      }
    },
    [findToplist, loadingIds, exhaustedIds, updateToplist]
  )

  // ────────────────────────────────────────────────────────────
  // Playlist detail loading
  // Use negative contentId in loadingIds/exhaustedIds to avoid
  // collision with toplist topId values.
  // ────────────────────────────────────────────────────────────

  const playlistKey = (contentId: number) => -contentId

  /**
   * Load the first page of songs for a playlist.
   */
  const loadPlaylistDetail = useCallback(
    async (contentId: number) => {
      const key = playlistKey(contentId)
      if (loadingIds.has(key)) return

      const existing = playlistDetails.get(contentId)
      if (existing?.detailLoaded) return

      setLoadingIds((prev) => new Set(prev).add(key))

      try {
        const page = await fetchPlaylistSongs(contentId, 0, 30)

        const detail: PlaylistDetail = {
          contentId,
          title: page.title,
          cover: page.cover,
          desc: page.desc,
          creator: page.creator,
          creatorAvatar: page.creatorAvatar,
          songs: page.songs,
          totalNum: page.totalNum,
          detailLoaded: true,
        }

        setPlaylistDetails((prev) => new Map(prev).set(contentId, detail))

        if (page.songs.length >= page.totalNum) {
          setExhaustedIds((prev) => new Set(prev).add(key))
        }
      } catch (e) {
        console.error(`Failed to load playlist ${contentId}:`, e)
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    [playlistDetails, loadingIds]
  )

  /**
   * Load the next page of songs for a playlist.
   */
  const loadMorePlaylistSongs = useCallback(
    async (contentId: number) => {
      const key = playlistKey(contentId)
      if (loadingIds.has(key) || exhaustedIds.has(key)) return

      const detail = playlistDetails.get(contentId)
      if (!detail?.detailLoaded) return

      setLoadingIds((prev) => new Set(prev).add(key))

      try {
        const offset = detail.songs.length
        const page = await fetchPlaylistSongs(contentId, offset, 30)

        setPlaylistDetails((prev) => {
          const next = new Map(prev)
          const existing = next.get(contentId)!
          next.set(contentId, {
            ...existing,
            songs: [...existing.songs, ...page.songs],
            totalNum: page.totalNum,
          })
          return next
        })

        const newTotal = detail.songs.length + page.songs.length
        if (page.songs.length < 30 || newTotal >= page.totalNum) {
          setExhaustedIds((prev) => new Set(prev).add(key))
        }
      } catch (e) {
        console.error(`Failed to load more playlist songs ${contentId}:`, e)
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    [playlistDetails, loadingIds, exhaustedIds]
  )

  return {
    groups,
    playlists,
    playlistDetails,
    isLoading,
    error,
    refresh,
    loadDetail,
    loadMore,
    loadPlaylistDetail,
    loadMorePlaylistSongs,
    loadingIds,
    exhaustedIds,
  }
}
