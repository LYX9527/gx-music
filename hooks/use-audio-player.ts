"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface UseAudioPlayerOptions {
    onEnded?: () => void
}

interface AudioPlayerState {
    isPlaying: boolean
    currentTime: number
    duration: number
    isLoading: boolean
    beatIntensity: number
    frequencyData: Uint8Array | null
}

export function useAudioPlayer(options?: UseAudioPlayerOptions) {
    const [state, setState] = useState<AudioPlayerState>({
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        isLoading: false,
        beatIntensity: 0,
        frequencyData: null,
    })

    const audioRef = useRef<HTMLAudioElement | null>(null)
    const audioCtxRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
    const gainRef = useRef<GainNode | null>(null)
    const animFrameRef = useRef<number>(0)
    const frequencyDataRef = useRef<Uint8Array | null>(null)
    const onEndedRef = useRef(options?.onEnded)
    const prevBeatRef = useRef(0)

    // Keep onEnded callback ref updated
    useEffect(() => {
        onEndedRef.current = options?.onEnded
    }, [options?.onEnded])

    // Initialize audio element once
    useEffect(() => {
        const audio = new Audio()
        audio.crossOrigin = "anonymous"
        audioRef.current = audio

        audio.addEventListener("ended", () => {
            setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }))
            onEndedRef.current?.()
        })

        audio.addEventListener("loadedmetadata", () => {
            setState((s) => ({ ...s, duration: audio.duration, isLoading: false }))
        })

        audio.addEventListener("error", () => {
            setState((s) => ({ ...s, isLoading: false }))
        })

        return () => {
            cancelAnimationFrame(animFrameRef.current)
            audio.pause()
            audio.removeAttribute("src")
            audio.load()
            if (audioCtxRef.current) {
                audioCtxRef.current.close()
            }
        }
    }, [])

    // Ensure AudioContext + Analyser are initialized
    const ensureAudioContext = useCallback(() => {
        if (audioCtxRef.current) return

        const ctx = new AudioContext()
        audioCtxRef.current = ctx

        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.7
        analyserRef.current = analyser

        const gain = ctx.createGain()
        gainRef.current = gain

        const source = ctx.createMediaElementSource(audioRef.current!)
        sourceRef.current = source

        source.connect(gain)
        gain.connect(analyser)
        analyser.connect(ctx.destination)

        frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount)
    }, [])

    // Animation loop for beat detection + time tracking
    const startAnimLoop = useCallback(() => {
        const tick = () => {
            const audio = audioRef.current
            const analyser = analyserRef.current
            const freqData = frequencyDataRef.current

            if (audio && !audio.paused) {
                let beatIntensity = 0
                if (analyser && freqData) {
                    analyser.getByteFrequencyData(freqData)

                    // Calculate beat intensity from bass frequencies (bins 0~8)
                    let bassSum = 0
                    const bassEnd = Math.min(8, freqData.length)
                    for (let i = 0; i < bassEnd; i++) {
                        bassSum += freqData[i]
                    }
                    const bassAvg = bassSum / bassEnd / 255

                    // Mid frequencies for richness
                    let midSum = 0
                    const midStart = 8
                    const midEnd = Math.min(32, freqData.length)
                    for (let i = midStart; i < midEnd; i++) {
                        midSum += freqData[i]
                    }
                    const midAvg = midSum / (midEnd - midStart) / 255

                    // Weighted combination
                    const rawIntensity = bassAvg * 0.7 + midAvg * 0.3

                    // Smooth with previous value
                    beatIntensity =
                        prevBeatRef.current * 0.3 + rawIntensity * 0.7
                    prevBeatRef.current = beatIntensity
                }

                setState((s) => ({
                    ...s,
                    currentTime: audio.currentTime,
                    isPlaying: true,
                    beatIntensity,
                    frequencyData: freqData ? new Uint8Array(freqData) : null,
                }))
            }

            animFrameRef.current = requestAnimationFrame(tick)
        }

        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = requestAnimationFrame(tick)
    }, [])

    const stopAnimLoop = useCallback(() => {
        cancelAnimationFrame(animFrameRef.current)
        prevBeatRef.current = 0
        setState((s) => ({ ...s, beatIntensity: 0 }))
    }, [])

    const loadUrl = useCallback(
        async (url: string) => {
            const audio = audioRef.current
            if (!audio) return

            setState((s) => ({ ...s, isLoading: true }))
            ensureAudioContext()

            // Resume AudioContext if suspended (browser autoplay policy)
            if (audioCtxRef.current?.state === "suspended") {
                await audioCtxRef.current.resume()
            }

            audio.src = url
            audio.load()
        },
        [ensureAudioContext]
    )

    const play = useCallback(async () => {
        const audio = audioRef.current
        if (!audio || !audio.src) return

        ensureAudioContext()
        if (audioCtxRef.current?.state === "suspended") {
            await audioCtxRef.current.resume()
        }

        try {
            await audio.play()
            setState((s) => ({ ...s, isPlaying: true }))
            startAnimLoop()
        } catch (e) {
            console.error("播放失败:", e)
        }
    }, [ensureAudioContext, startAnimLoop])

    const pause = useCallback(() => {
        audioRef.current?.pause()
        setState((s) => ({ ...s, isPlaying: false }))
        stopAnimLoop()
    }, [stopAnimLoop])

    const togglePlay = useCallback(() => {
        if (audioRef.current?.paused) {
            play()
        } else {
            pause()
        }
    }, [play, pause])

    const seek = useCallback((time: number) => {
        const audio = audioRef.current
        if (!audio) return
        audio.currentTime = Math.max(0, Math.min(time, audio.duration || 0))
        setState((s) => ({ ...s, currentTime: audio.currentTime }))
    }, [])

    const setVolume = useCallback((volume: number) => {
        // volume: 0~100
        const audio = audioRef.current
        if (audio) {
            audio.volume = Math.max(0, Math.min(1, volume / 100))
        }
    }, [])

    return {
        ...state,
        loadUrl,
        play,
        pause,
        togglePlay,
        seek,
        setVolume,
    }
}
