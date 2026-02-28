"use client"

import { useEffect, useRef, useMemo } from "react"

export interface LyricLine {
  time: number // seconds
  text: string
}

interface LyricsScrollerProps {
  lyrics: LyricLine[]
  currentTime: number
  isPlaying: boolean
  beatIntensity: number
}

export function LyricsScroller({
  lyrics,
  currentTime,
  isPlaying,
  beatIntensity,
}: LyricsScrollerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeIndexRef = useRef(0)
  const scrollAnimRef = useRef<number>(0)
  const currentScrollRef = useRef(0)
  const targetScrollRef = useRef(0)

  // Find active lyric index
  const activeIndex = useMemo(() => {
    let idx = 0
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTime >= lyrics[i].time) {
        idx = i
        break
      }
    }
    return idx
  }, [currentTime, lyrics])

  // Cubic bezier easing: approximation of cubic-bezier(0.25, 0.1, 0.25, 1.0)
  // This gives a smooth, elegant deceleration feel
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const lineElements = container.querySelectorAll<HTMLElement>("[data-lyric-line]")
    if (!lineElements[activeIndex]) return

    const activeLine = lineElements[activeIndex]
    const containerHeight = container.clientHeight
    const lineTop = activeLine.offsetTop
    const lineHeight = activeLine.offsetHeight

    // Target: center the active line
    targetScrollRef.current = lineTop - containerHeight / 2 + lineHeight / 2

    // If index changed, start smooth scroll animation
    if (activeIndex !== activeIndexRef.current) {
      activeIndexRef.current = activeIndex
      startSmoothScroll()
    }
  }, [activeIndex])

  const startSmoothScroll = () => {
    cancelAnimationFrame(scrollAnimRef.current)

    const startScroll = currentScrollRef.current
    const endScroll = targetScrollRef.current
    const distance = endScroll - startScroll
    const duration = 600 // ms
    let startTime: number | null = null

    // Custom cubic bezier approximation for elegant easing
    // Emulates cubic-bezier(0.16, 1, 0.3, 1) - a fast start with a very smooth deceleration
    const easeOutExpo = (t: number): number => {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
    }

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutExpo(progress)

      currentScrollRef.current = startScroll + distance * eased

      if (containerRef.current) {
        containerRef.current.scrollTop = currentScrollRef.current
      }

      if (progress < 1) {
        scrollAnimRef.current = requestAnimationFrame(step)
      }
    }

    scrollAnimRef.current = requestAnimationFrame(step)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(scrollAnimRef.current)
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-hidden"
      style={{ maskImage: "linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)" }}
    >
      {/* Top spacer to allow first line to center */}
      <div className="h-[45%]" />

      {lyrics.map((line, index) => {
        const isActive = index === activeIndex
        const isPast = index < activeIndex
        const distance = Math.abs(index - activeIndex)

        // Opacity: active is brightest, fades with distance
        let opacity = 0.2
        if (isActive) opacity = 1
        else if (distance === 1) opacity = 0.45
        else if (distance === 2) opacity = 0.3
        else opacity = 0.18

        // Scale: active is slightly larger
        const scale = isActive ? 1.0 : 0.92

        // Blur far away lines slightly
        const blur = distance > 3 ? 1 : 0

        // Active line no longer pulses to the beat (per user request to remove jitter)
        const beatScale = 1

        return (
          <div
            key={index}
            data-lyric-line
            className="flex items-center justify-center px-6 py-3"
            style={{
              opacity,
              transform: `scale(${scale * beatScale})`,
              filter: blur > 0 ? `blur(${blur}px)` : undefined,
              transition: "opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), filter 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <p
              className={`text-center text-balance leading-relaxed font-medium transition-all duration-500 ${isActive
                  ? "text-white text-[22px] font-bold tracking-wide"
                  : isPast
                    ? "text-white/40 text-[17px]"
                    : "text-white/30 text-[17px]"
                }`}
              style={{
                textShadow: isActive
                  ? `0 2px 12px rgba(255, 255, 255, 0.3)`
                  : undefined,
              }}
            >
              {line.text}
            </p>
          </div>
        )
      })}

      {/* Bottom spacer to allow last line to center */}
      <div className="h-[45%]" />
    </div>
  )
}
