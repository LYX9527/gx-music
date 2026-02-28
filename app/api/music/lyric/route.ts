import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const HEADERS = {
    referer: 'https://y.qq.com',
    'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
    Cookie: 'uin=',
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const songmid = searchParams.get('songmid')

    if (!songmid) {
        return NextResponse.json({ code: -1, msg: "Missing songmid" }, { status: 400 })
    }

    try {
        const url = `http://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songmid}&pcachetime=${Date.now()}&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0`
        const res = await fetch(url, { headers: HEADERS })
        const text = await res.text()

        const jsonStr = text.replace(
            /callback\(|MusicJsonCallback\(|jsonCallback\(|\)$/g,
            ""
        )
        const jsonObj = JSON.parse(jsonStr)

        if (jsonObj.lyric) {
            return NextResponse.json({ code: 0, lyric: jsonObj.lyric })
        }
        return NextResponse.json({ code: -1, msg: "No lyric found" })
    } catch (error) {
        return NextResponse.json({ code: -1, msg: "Lyric fetch failed" }, { status: 500 })
    }
}
