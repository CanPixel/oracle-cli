import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: '#0b0f0b',
  colorScheme: 'dark',
};

export const metadata: Metadata = {
  title: "The Oracle",
  description: "Sci‑fi RAG console with local Ollama models and switchable quantizations.",
  icons: [{ rel: 'icon', url: '/favicon.ico' }],
  metadataBase: new URL('http://localhost:3000'),
  applicationName: 'The Oracle',
  category: 'AI',
  openGraph: {
    title: 'The Oracle',
    description: 'Sci‑fi RAG console with local Ollama models and switchable quantizations.',
    url: '/',
    siteName: 'The Oracle',
    type: 'website'
  },
  twitter: {
    card: 'summary',
    title: 'The Oracle',
    description: 'Sci‑fi RAG console with local Ollama models and switchable quantizations.'
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning={true}
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
