"use client"

import { useEffect, useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"

declare global {
  interface Window {
    __TAURI_INTERNALS__?: any;
  }
}

export function MacOSWindowControls() {
  const [isTauri, setIsTauri] = useState(false)

  useEffect(() => {
    setIsTauri(typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined)
  }, [])

  const handleClose = async () => {
    if (isTauri) {
      await getCurrentWindow().close()
    }
  }

  const handleMinimize = async () => {
    if (isTauri) {
      await getCurrentWindow().minimize()
    }
  }

  const handleMaximize = async () => {
    if (isTauri) {
      await getCurrentWindow().toggleMaximize()
    }
  }

  return (
    <div className="flex items-center gap-2 group">
      {/* Close button */}
      <button
        onClick={handleClose}
        className="relative flex h-3 w-3 items-center justify-center rounded-full bg-[#FF5F57] transition-all hover:bg-[#ff4e44]"
        title="关闭"
      >
        <div className="absolute inset-0 rounded-full shadow-[inset_0_-1px_1px_rgba(0,0,0,0.2)] pointer-events-none" />
        <span className="opacity-0 group-hover:opacity-100 text-[#4c0000] text-[10px] leading-none mb-0.5">✕</span>
      </button>

      {/* Minimize button */}
      <button
        onClick={handleMinimize}
        className="relative flex h-3 w-3 items-center justify-center rounded-full bg-[#FEBC2E] transition-all hover:bg-[#edaf25]"
        title="最小化"
      >
        <div className="absolute inset-0 rounded-full shadow-[inset_0_-1px_1px_rgba(0,0,0,0.2)] pointer-events-none" />
        <span className="opacity-0 group-hover:opacity-100 text-[#5c3e00] text-[13px] leading-none mb-0.5 font-bold">−</span>
      </button>

      {/* Maximize button */}
      <button
        onClick={handleMaximize}
        className="relative flex h-3 w-3 items-center justify-center rounded-full bg-[#28C840] transition-all hover:bg-[#23b338]"
        title="全屏"
      >
        <div className="absolute inset-0 rounded-full shadow-[inset_0_-1px_1px_rgba(0,0,0,0.2)] pointer-events-none" />
        <span className="opacity-0 group-hover:opacity-100 text-[#003800] text-[10px] leading-none mb-0.5">↙</span>
      </button>
    </div>
  )
}
