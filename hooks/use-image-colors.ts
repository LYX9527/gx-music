"use client"

import { useState, useEffect } from "react"

interface ImageColors {
  dominant: string
  secondary: string
  muted: string
}

const DEFAULT_COLORS: ImageColors = {
  dominant: "rgb(30, 30, 50)",
  secondary: "rgb(20, 20, 40)",
  muted: "rgb(15, 15, 30)",
}

function getPixelBucket(r: number, g: number, b: number): string {
  // Quantize to 32-step buckets for grouping
  const qr = Math.round(r / 32) * 32
  const qg = Math.round(g / 32) * 32
  const qb = Math.round(b / 32) * 32
  return `${qr},${qg},${qb}`
}

function colorDistance(a: number[], b: number[]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

function isSaturatedEnough(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const diff = max - min
  // Filter out very gray/desaturated pixels and very dark/very bright ones
  return diff > 30 && max > 40 && max < 240
}

function extractColors(imageData: ImageData): ImageColors {
  const data = imageData.data
  const buckets: Record<string, { count: number; r: number; g: number; b: number }> = {}

  // Sample every 4th pixel for performance
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]

    if (a < 128) continue
    if (!isSaturatedEnough(r, g, b)) continue

    const key = getPixelBucket(r, g, b)
    if (!buckets[key]) {
      buckets[key] = { count: 0, r: 0, g: 0, b: 0 }
    }
    buckets[key].count++
    buckets[key].r += r
    buckets[key].g += g
    buckets[key].b += b
  }

  // Sort buckets by frequency
  const sorted = Object.values(buckets)
    .filter((b) => b.count > 3)
    .sort((a, b) => b.count - a.count)

  if (sorted.length === 0) return DEFAULT_COLORS

  const dominant = sorted[0]
  const dr = Math.round(dominant.r / dominant.count)
  const dg = Math.round(dominant.g / dominant.count)
  const db = Math.round(dominant.b / dominant.count)

  // Find a secondary color that is sufficiently different from dominant
  let sr = dr, sg = dg, sb = db
  for (let i = 1; i < sorted.length; i++) {
    const c = sorted[i]
    const cr = Math.round(c.r / c.count)
    const cg = Math.round(c.g / c.count)
    const cb = Math.round(c.b / c.count)
    if (colorDistance([cr, cg, cb], [dr, dg, db]) > 60) {
      sr = cr
      sg = cg
      sb = cb
      break
    }
  }

  // Darken colors for background use (multiply by factor)
  const darken = (r: number, g: number, b: number, factor: number) =>
    `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`

  return {
    dominant: darken(dr, dg, db, 0.35),
    secondary: darken(sr, sg, sb, 0.25),
    muted: darken(dr, dg, db, 0.12),
  }
}

export function useImageColors(src: string): ImageColors {
  const [colors, setColors] = useState<ImageColors>(DEFAULT_COLORS)

  useEffect(() => {
    if (!src) return

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = src

    img.onload = () => {
      const canvas = document.createElement("canvas")
      const size = 80 // Small size for speed
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.drawImage(img, 0, 0, size, size)
      const imageData = ctx.getImageData(0, 0, size, size)
      const extracted = extractColors(imageData)
      setColors(extracted)
    }
  }, [src])

  return colors
}
