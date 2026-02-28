"use client"

interface AlbumArtworkProps {
  src: string
  alt: string
  isPlaying: boolean
  beatIntensity: number
}

export function AlbumArtwork({ src, alt, isPlaying, beatIntensity }: AlbumArtworkProps) {
  const scale = isPlaying ? 1 + beatIntensity * 0.03 : 1
  const glowSize = isPlaying ? 40 + beatIntensity * 40 : 20

  return (
    <div className="relative flex items-center justify-center">
      {/* Glow backdrop */}
      <div
        className="absolute inset-0 rounded-2xl transition-all duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, rgba(200,80,60,${isPlaying ? 0.15 + beatIntensity * 0.15 : 0.05}) 0%, transparent 70%)`,
          filter: `blur(${glowSize}px)`,
          transform: `scale(1.3)`,
        }}
      />

      {/* Vinyl record behind */}
      <div
        className="absolute z-0"
        style={{
          width: "88%",
          height: "88%",
          right: "-12%",
          borderRadius: "50%",
          background: `
            radial-gradient(circle at center, 
              #1a1a2e 0%, #1a1a2e 18%, 
              #2a2a3e 19%, #1a1a2e 20%, 
              #2a2a3e 21%, #1a1a2e 22%,
              #2a2a3e 35%, #1a1a2e 36%,
              #2a2a3e 37%, #1a1a2e 38%,
              #2a2a3e 50%, #1a1a2e 51%,
              #2a2a3e 52%, #1a1a2e 53%,
              #2a2a3e 65%, #1a1a2e 66%,
              #2a2a3e 67%, #1a1a2e 68%,
              #1a1a2e 100%
            )
          `,
          animation: isPlaying ? "spin 3s linear infinite" : undefined,
          transition: "transform 0.5s ease",
        }}
      >
        {/* Center label */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: "28%",
            height: "28%",
            background: "radial-gradient(circle, #c8503c 0%, #8b3a2e 100%)",
          }}
        >
          <div
            className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: "#1a1a2e" }}
          />
        </div>
      </div>

      {/* Album Art */}
      <div
        className="relative z-10 aspect-square w-full overflow-hidden rounded-xl shadow-2xl transition-transform duration-300 bg-black/20"
        style={{ transform: `scale(${scale})` }}
      >
        <img
          src={src || '/placeholder-logo.png'}
          alt={alt || 'Album Art'}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    </div>
  )
}
