import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider, themeScript } from "@/components/ThemeProvider";
import { WalletProvider } from "@/hooks/WalletProvider";
import "./globals.css";

/**
 * Typeface roles:
 *  - Fraunces for display. A variable serif with real optical sizing; it sets
 *    an editorial tone that a geometric sans cannot, and it is the opposite of
 *    the default Inter look.
 *  - IBM Plex Sans for body and UI. Its cut is neutral without being generic.
 *  - IBM Plex Mono for addresses, signatures and any number a reader may need
 *    to compare character by character.
 */
const display = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  axes: ["SOFT", "WONK", "opsz"],
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
  variable: "--font-mono",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://deathclock-protocol.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "DeathClock — verifiable inheritance on Solana",
    template: "%s · DeathClock",
  },
  description:
    "A Solana vault that releases an estate on verifiable absence of a zero-knowledge heartbeat. 48-hour challenge window, 0.5% fee, no probate court.",
  applicationName: "DeathClock",
  keywords: [
    "Solana",
    "inheritance",
    "zero knowledge",
    "RISC Zero",
    "Groth16",
    "Anchor",
    "estate",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: "DeathClock — verifiable inheritance on Solana",
    description:
      "Your estate pays out on a verifiable absence. Deposit SOL, prove life with a zero-knowledge heartbeat, and let a 48-hour challenge window protect your heirs from a false report.",
    siteName: "DeathClock",
  },
  twitter: {
    card: "summary_large_image",
    title: "DeathClock — verifiable inheritance on Solana",
    description:
      "A trustless Solana vault that pays out on a verifiable absence of a zero-knowledge heartbeat.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2efe8" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e12" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The font variables and the theme class both live on <html> so the theme
    // script can set the class before React hydrates.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        {/*
          Applies the stored theme before first paint. It has to be inline and
          synchronous: deferring it to a bundle lets the page render once in
          the wrong theme.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          {/*
            One wallet state for the whole tree. The header button and the app
            both read the connection, and two separate hook instances made the
            header connect a provider the app never saw -- which surfaced as
            `s.connect is not a function` on the reconnect path.
          */}
          <WalletProvider>{children}</WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
