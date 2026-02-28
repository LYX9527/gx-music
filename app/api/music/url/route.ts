import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const songmid = searchParams.get('songmid')
    const quality = searchParams.get('quality') || '128k'

    if (!songmid) {
        return NextResponse.json({ code: -1, msg: "Missing songmid" }, { status: 400 })
    }

    try {
        const res = await fetch(
            `https://lxmusicapi.onrender.com/url/tx/${songmid}/${quality}`,
            {
                headers: {
                    'X-Request-Key': 'share-v3',
                    'User-Agent': 'lx-music-request/2.6.0',
                },
            }
        )
        const data: any = await res.json()
        if (data && data.code === 0 && data.url) {
            return NextResponse.json({ code: 0, url: data.url })
        }
        return NextResponse.json({ code: -1, msg: "No URL found" })
    } catch (error) {
        return NextResponse.json({ code: -1, msg: "Fetch url failed" }, { status: 500 })
    }
}
