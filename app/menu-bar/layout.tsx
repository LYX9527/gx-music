import "../globals.css"

export const metadata = {
  title: "Muse Mini Player",
}

export default function MenuBarLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Inline style overrides to make the popover window transparent so the
  // rounded corners and drop shadow on the inner card show through.
  // The script runs as a `dangerouslySetInnerHTML` so it executes before paint
  // (Next.js inserts it as a <script> in document head order).
  return (
    <>
      <style>{`
        html, body {
          background: transparent !important;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
      `}</style>
      {children}
    </>
  )
}
