"use client"

import { useEffect } from "react"

export function ContextMenuBlocker() {
    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            if (process.env.NODE_ENV !== "development") {
                e.preventDefault()
            }
        }

        document.addEventListener("contextmenu", handleContextMenu)
        return () => {
            document.removeEventListener("contextmenu", handleContextMenu)
        }
    }, [])

    return null
}
