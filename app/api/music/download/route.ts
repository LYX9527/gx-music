import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const url = searchParams.get("url")

    if (!url) {
        return NextResponse.json({ code: 400, msg: "Missing url parameter" }, { status: 400 })
    }

    try {
        const response = await fetch(url, {
            headers: {
                "Referer": "https://y.qq.com",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
        })

        if (!response.ok) {
            return NextResponse.json({ code: response.status, msg: "Failed to download stream" }, { status: response.status })
        }

        // Return the stream directly with correct headers
        const headers = new Headers(response.headers)
        // Ensure CORS allows the client to read it (though Next.js API routes are same-origin anyway)
        headers.set("Access-Control-Allow-Origin", "*")

        // Strip out headers that might cause issues when proxying
        headers.delete("content-encoding")
        headers.delete("transfer-encoding")

        return new NextResponse(response.body, {
            status: 200,
            headers,
        })
    } catch (e: any) {
        return NextResponse.json({ code: 500, msg: e.message }, { status: 500 })
    }
}
