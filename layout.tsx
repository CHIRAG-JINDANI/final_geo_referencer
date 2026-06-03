import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GeoRef Studio',
  description: 'Automatic georeferencing using AI-assisted feature matching',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
