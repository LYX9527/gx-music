"use client"

import { useEffect, useRef, useCallback } from "react"

interface AudioVisualizerProps {
  isPlaying: boolean
  beatIntensity: number
  frequencyData?: Uint8Array | null
}

export function AudioVisualizer({ isPlaying, beatIntensity, frequencyData }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const barsRef = useRef<number[]>([])
  const targetBarsRef = useRef<number[]>([])
  const peaksRef = useRef<number[]>([])
  const peakFallRef = useRef<number[]>([])
  const timeRef = useRef(0)

  const BAR_COUNT = 48

  useEffect(() => {
    if (barsRef.current.length === 0) {
      barsRef.current = Array.from({ length: BAR_COUNT }, () => 0.02)
      targetBarsRef.current = Array.from({ length: BAR_COUNT }, () => 0.02)
      peaksRef.current = Array.from({ length: BAR_COUNT }, () => 0.02)
      peakFallRef.current = Array.from({ length: BAR_COUNT }, () => 0)
    }
  }, [])

  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height

    ctx.clearRect(0, 0, width, height)

    timeRef.current += 0.016

    // Set target values based on real freq data or fallback simulation
    if (isPlaying && frequencyData && frequencyData.length > 0) {
      // We map the first ~half of the frequency bins to our bars (higher frequencies are often empty/quiet)
      const dataLen = Math.floor(frequencyData.length * 0.6)
      const step = Math.max(1, Math.floor(dataLen / BAR_COUNT))

      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0
        let count = 0
        for (let j = 0; j < step && Math.floor(i * step) + j < dataLen; j++) {
          sum += frequencyData[Math.floor(i * step) + j]
          count++
        }

        const avg = count > 0 ? sum / count : 0
        // Normalize 0-255 to 0-1
        let norm = avg / 255.0

        // Non-linear boost to make it look punchy but not consistently maxed out
        norm = Math.min(0.98, Math.pow(norm, 1.4) * 1.5)

        targetBarsRef.current[i] = Math.max(0.04, norm)
      }
    } else if (isPlaying) {
      for (let i = 0; i < BAR_COUNT; i++) {
        const normalizedIndex = i / BAR_COUNT
        const bassBoost = Math.max(0, 1 - normalizedIndex * 1.5) * 0.3
        const midPresence = Math.sin(normalizedIndex * Math.PI * 1.2) * 0.35

        const wave1 = Math.sin(timeRef.current * 2.8 + i * 0.25) * 0.22
        const wave2 = Math.sin(timeRef.current * 4.5 + i * 0.4) * 0.18
        const wave3 = Math.cos(timeRef.current * 1.7 + i * 0.65) * 0.12
        const wave4 = Math.sin(timeRef.current * 6.2 + i * 0.12) * 0.08

        const beatFactor = (1 - normalizedIndex * 0.5)
        const beatPulse = beatIntensity * beatFactor * 0.45

        const jitter = (Math.random() - 0.5) * 0.06

        targetBarsRef.current[i] = Math.max(
          0.04,
          Math.min(0.98, bassBoost + midPresence + wave1 + wave2 + wave3 + wave4 + beatPulse + jitter + 0.15)
        )
      }
    } else {
      // Idle state
      for (let i = 0; i < BAR_COUNT; i++) {
        targetBarsRef.current[i] = 0.02 + Math.sin(timeRef.current * 0.3 + i * 0.08) * 0.015
      }
    }

    // Smooth interpolation toward targets
    for (let i = 0; i < BAR_COUNT; i++) {
      const speed = isPlaying ? 0.35 : 0.04 // Faster response when playing real audio
      barsRef.current[i] += (targetBarsRef.current[i] - barsRef.current[i]) * speed

      // Update peaks (falling dots on top of bars)
      if (barsRef.current[i] > peaksRef.current[i]) {
        peaksRef.current[i] = barsRef.current[i]
        peakFallRef.current[i] = 0
      } else {
        peakFallRef.current[i] += 0.0006
        peaksRef.current[i] -= peakFallRef.current[i]
        if (peaksRef.current[i] < barsRef.current[i]) {
          peaksRef.current[i] = barsRef.current[i]
        }
      }
    }

    // Draw bars
    const totalGap = BAR_COUNT - 1
    const barWidth = Math.max(2, (width - totalGap * 2) / BAR_COUNT)
    const gap = 2

    for (let i = 0; i < BAR_COUNT; i++) {
      const barH = barsRef.current[i] * height * 0.92
      const x = i * (barWidth + gap)
      const y = height - barH

      // Gradient across bars: cyan -> blue -> purple -> magenta -> pink
      const t = i / (BAR_COUNT - 1)

      let r: number, g: number, b: number
      if (t < 0.25) {
        const p = t / 0.25; r = Math.round(0 + p * 40); g = Math.round(220 + p * (-30)); b = Math.round(235 + p * 10)
      } else if (t < 0.5) {
        const p = (t - 0.25) / 0.25; r = Math.round(40 + p * 110); g = Math.round(190 + p * (-120)); b = Math.round(245 + p * (-15))
      } else if (t < 0.75) {
        const p = (t - 0.5) / 0.25; r = Math.round(150 + p * 70); g = Math.round(70 + p * (-20)); b = Math.round(230 + p * (-30))
      } else {
        const p = (t - 0.75) / 0.25; r = Math.round(220 + p * 35); g = Math.round(50 + p * 40); b = Math.round(200 + p * (-80))
      }

      const brightness = 0.7 + barsRef.current[i] * 0.3
      const fr = Math.min(255, Math.round(r * brightness))
      const fg = Math.min(255, Math.round(g * brightness))
      const fb = Math.min(255, Math.round(b * brightness))

      const grad = ctx.createLinearGradient(x, y, x, height)
      grad.addColorStop(0, `rgba(${Math.min(255, fr + 40)}, ${Math.min(255, fg + 30)}, ${Math.min(255, fb + 20)}, 1)`)
      grad.addColorStop(0.6, `rgba(${fr}, ${fg}, ${fb}, 0.95)`)
      grad.addColorStop(1, `rgba(${Math.round(fr * 0.5)}, ${Math.round(fg * 0.4)}, ${Math.round(fb * 0.5)}, 0.7)`)

      ctx.fillStyle = grad

      const radius = Math.min(barWidth / 2, 2.5)
      ctx.beginPath()
      ctx.moveTo(x + radius, y)
      ctx.lineTo(x + barWidth - radius, y)
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius)
      ctx.lineTo(x + barWidth, height)
      ctx.lineTo(x, height)
      ctx.lineTo(x, y + radius)
      ctx.quadraticCurveTo(x, y, x + radius, y)
      ctx.closePath()
      ctx.fill()

      if (isPlaying && barsRef.current[i] > 0.45) {
        ctx.save()
        ctx.shadowColor = `rgba(${fr}, ${fg}, ${fb}, 0.5)`
        ctx.shadowBlur = 10 + barsRef.current[i] * 8
        ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, 0.15)`
        ctx.fill()
        ctx.restore()
      }

      if (isPlaying) {
        const peakY = height - peaksRef.current[i] * height * 0.92
        if (peakY < y - 3) {
          ctx.fillStyle = `rgba(${Math.min(255, fr + 60)}, ${Math.min(255, fg + 50)}, ${Math.min(255, fb + 40)}, 0.9)`
          ctx.fillRect(x, peakY, barWidth, 2)
        }
      }
    }

    if (isPlaying) {
      ctx.save()
      ctx.globalAlpha = 0.06
      ctx.scale(1, -0.2)
      ctx.translate(0, -height * 6)
      for (let i = 0; i < BAR_COUNT; i++) {
        const barH = barsRef.current[i] * height * 0.92
        const x = i * (barWidth + gap)
        const y = height - barH
        const t = i / (BAR_COUNT - 1)

        let r: number, g: number, b: number
        if (t < 0.25) { r = Math.round(0 + (t / 0.25) * 40); g = Math.round(220 - (t / 0.25) * 30); b = 240 }
        else if (t < 0.5) { const p = (t - 0.25) / 0.25; r = Math.round(40 + p * 110); g = Math.round(190 - p * 120); b = 235 }
        else if (t < 0.75) { const p = (t - 0.5) / 0.25; r = Math.round(150 + p * 70); g = Math.round(70 - p * 20); b = 225 }
        else { const p = (t - 0.75) / 0.25; r = Math.round(220 + p * 35); g = Math.round(50 + p * 40); b = Math.round(200 - p * 80) }
        ctx.fillStyle = `rgba(${r},${g},${b},0.5)`
        ctx.fillRect(x, y, barWidth, barH)
      }
      ctx.restore()
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [isPlaying, beatIntensity, frequencyData])

  useEffect(() => {
    animationRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationRef.current)
  }, [animate])

  return <canvas ref={canvasRef} className="h-full w-full" style={{ display: "block" }} />
}
