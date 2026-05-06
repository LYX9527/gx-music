import type { LyricLine } from "@/components/lyrics-scroller"

/**
 * Find the lyric line that should be highlighted at the given playback time.
 * Returns the last line whose `time` is ≤ `currentTime`.
 *
 * Shared by:
 *   - LyricsScroller (main window full-page lyrics view)
 *   - useTraySync (status bar title)
 *   - MiniPlayer (popover one-line preview)
 */
export function getActiveLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (!lyrics.length) return -1
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].time) return i
  }
  return 0
}

export function getActiveLyric(lyrics: LyricLine[], currentTime: number): string {
  const idx = getActiveLyricIndex(lyrics, currentTime)
  return idx >= 0 ? lyrics[idx].text : ""
}

interface ScrollWindowOptions {
  /** Visible character window length (Unicode code points, not UTF-16 units). */
  windowSize: number
  /**
   * Fallback duration (seconds) used for the very last lyric line, since it
   * has no "next line" to bound it. Also used when audio duration is unknown.
   */
  lastLineFallbackSec?: number
  /**
   * Total audio duration (seconds). Used to clamp the last lyric's end time.
   * If omitted, falls back to `lastLineFallbackSec`.
   */
  audioDuration?: number
}

/**
 * Compute the slice of an active lyric line that should currently be visible
 * in a fixed-width display (e.g. the macOS status bar title).
 *
 * Behavior:
 *   - If the line fits in `windowSize`, returns it as-is (no ellipsis).
 *   - Otherwise the visible window slides by one character through the line
 *     across the line's duration. Each frame shows `windowSize` characters,
 *     padded with a trailing "…" so the user sees they aren't done reading.
 *
 * Example with windowSize=7 on "1234567890123" lasting 4s:
 *   t=0.0s -> "1234567…"
 *   t=0.5s -> "2345678…"
 *   t=1.0s -> "3456789…"
 *   ...
 *   t=3.5s -> "7890123" (final, no ellipsis once tail is fully shown)
 */
export function getScrollingLyricWindow(
  lyrics: LyricLine[],
  currentTime: number,
  options: ScrollWindowOptions
): string {
  const { windowSize, lastLineFallbackSec = 5, audioDuration } = options

  const idx = getActiveLyricIndex(lyrics, currentTime)
  if (idx < 0) return ""

  const line = lyrics[idx]
  // Use Array.from for proper Unicode code point splitting (so emoji /
  // surrogate pairs count as 1 visible glyph).
  const chars = Array.from(line.text)
  if (chars.length <= windowSize) return line.text

  // End time for the current line: the next line's start, or, for the last
  // line, the audio duration (clamped) or a sensible fallback.
  let endTime: number
  if (idx + 1 < lyrics.length) {
    endTime = lyrics[idx + 1].time
  } else if (typeof audioDuration === "number" && audioDuration > line.time) {
    endTime = audioDuration
  } else {
    endTime = line.time + lastLineFallbackSec
  }

  const lineDuration = Math.max(0.1, endTime - line.time)
  const totalFrames = chars.length - windowSize + 1 // count of distinct windows
  const elapsed = Math.max(0, currentTime - line.time)
  // Reserve ~10% of the line duration at the end as a "rest" period showing
  // the final window — gives users a beat to finish reading the tail.
  const scrollDuration = lineDuration * 0.9
  const progress = Math.min(1, elapsed / scrollDuration)
  const frame = Math.min(totalFrames - 1, Math.floor(progress * totalFrames))

  const slice = chars.slice(frame, frame + windowSize).join("")
  // Once we've reached the final window the user has seen the whole line —
  // drop the ellipsis so the trailing characters aren't hidden behind "…".
  return frame >= totalFrames - 1 ? slice : `${slice}…`
}
