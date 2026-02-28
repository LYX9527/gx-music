import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const HEADERS = {
    referer: 'https://y.qq.com',
    'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
    Cookie: 'uin=',
}

export async function POST(req: Request) {
    try {
        const { query, page } = await req.json()
        const res = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
            method: "POST",
            headers: { ...HEADERS, "Content-Type": "application/json" },
            body: JSON.stringify({
                req_1: {
                    method: 'DoSearchForQQMusicDesktop',
                    module: 'music.search.SearchCgiService',
                    param: {
                        num_per_page: 20,
                        page_num: page || 1,
                        query: query || '',
                        search_type: 0,
                    },
                },
            }),
        })
        const data: any = await res.json()
        const songs = data?.req_1?.data?.body?.song?.list ?? []

        const formatted = songs.map((item: any) => {
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
        return NextResponse.json({ code: 0, data: formatted })
    } catch (error) {
        return NextResponse.json({ code: -1, msg: "Search failed" }, { status: 500 })
    }
}
