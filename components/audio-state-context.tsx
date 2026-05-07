"use client"

import { createContext, memo, useContext } from "react"

/**
 * High-frequency audio state lives in this context so that components
 * needing `currentTime` / `duration` / `beatIntensity` (the progress bar,
 * the play button's beat-driven glow, etc) can subscribe locally without
 * forcing their parents to re-render at 60fps.
 *
 * The provider is mounted in `<MusicPlayer />`. Consumers are only
 * `<ProgressBar />` and `<PlayButton />` inside `<PlayerControls />`,
 * keeping the rest of the controls subtree (volume, view toggles,
 * sidebar nav, dialogs) static unless their own props change.
 */
export interface AudioState {
  currentTime: number
  duration: number
  beatIntensity: number
  isPlaying: boolean
  isLoading: boolean
}

const DEFAULT_AUDIO_STATE: AudioState = {
  currentTime: 0,
  duration: 0,
  beatIntensity: 0,
  isPlaying: false,
  isLoading: false,
}

export const AudioStateContext = createContext<AudioState>(DEFAULT_AUDIO_STATE)

export function useAudioState(): AudioState {
  return useContext(AudioStateContext)
}

/**
 * Renders a beat-driven radial pulse overlay. Subscribes to the audio
 * context directly so MusicPlayer's render doesn't pay the 60fps cost of
 * a beat update.
 */
interface BeatPulseOverlayProps {
  dominant: string // e.g. "rgb(50, 30, 20)"
  secondary: string
}

export const BeatPulseOverlay = memo(function BeatPulseOverlay({
  dominant,
  secondary,
}: BeatPulseOverlayProps) {
  const { isPlaying, beatIntensity } = useAudioState()
  const domRgba = (a: number) => dominant.replace("rgb", "rgba").replace(")", `,${a})`)
  const secRgba = (a: number) => secondary.replace("rgb", "rgba").replace(")", `,${a})`)
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 rounded-2xl"
      style={{
        background: `
          radial-gradient(ellipse at 25% 25%, ${domRgba(0.2)} 0%, transparent 50%),
          radial-gradient(ellipse at 75% 75%, ${secRgba(0.12)} 0%, transparent 45%)
        `,
        opacity: isPlaying ? 0.5 + beatIntensity * 0.5 : 0.3,
        transition: "opacity 0.15s ease-out",
      }}
    />
  )
})

