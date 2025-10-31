import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, VT323 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const oracle = VT323({
  variable: "--font-oracle",
  display: 'swap',
  weight: "400",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: '#0b0f0b',
  colorScheme: 'dark',
};

export const metadata: Metadata = {
  title: "O R A C L E",
  description: "Sci‑fi RAG console with local Ollama models and switchable quantizations.",
  icons: [{ rel: 'icon', url: '/favicon.ico' }],
  metadataBase: new URL('http://localhost:3000'),
  applicationName: 'O R A C L E',
  category: 'AI',
  openGraph: {
    title: 'O R A C L E',
    description: 'Sci‑fi RAG console with local Ollama models and switchable quantizations.',
    url: '/',
    siteName: 'O R A C L E',
    type: 'website',
    images: [
      {
        url: '/favicon.ico',
        width: 630,
        height: 630,
        alt: 'Oracle Logo',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'O R A C L E',
    description: 'Sci‑fi RAG console with local Ollama models and switchable quantizations.',
    images: ['/favicon.ico'],
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" type="image/ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Orbitron:wght@400;700&family=Anta&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning={true}
        className={`${geistSans.variable} ${geistMono.variable} ${oracle.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
