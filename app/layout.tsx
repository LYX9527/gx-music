import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import { ContextMenuBlocker } from '@/components/context-menu-blocker'
import './globals.css'
export const viewport: Viewport = {
  themeColor: '#080810',
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'Muse Player - macOS Music Player',
  description: 'A beautiful macOS-style music player with beat-responsive visualizations',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <ContextMenuBlocker />
        {children}
        <Analytics />
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  )
}
