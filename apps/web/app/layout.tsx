import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { env } from "@/env";
import { loadServerEnv } from "@/env-schema";
import { indexingAllowed } from "@/lib/site";

// display "optional": on a slow first visit the size-matched fallback stays for that page view instead of swapping late,
// which would repaint the largest text (LCP) and shift the layout (CLS); the font is cached for the next page.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "optional" });
// Headings only: not preloaded, so it never competes with the page itself for a slow connection.
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "optional", preload: false });

export const metadata: Metadata = { metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL), title: "Bayana", description: "Advance bookings for independent service businesses", applicationName: "Bayana", openGraph: { siteName: "Bayana", type: "website", locale: "en_IN" },
  // Pages that do not set robots themselves inherit this: noindex until production and the legal review (lib/site.ts).
  ...(indexingAllowed(loadServerEnv()) ? {} : { robots: { index: false, follow: false } }) };
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#fafaf7" }, { media: "(prefers-color-scheme: dark)", color: "#0f1218" }] };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        <a href="#main" className="sr-only z-[100] rounded-input bg-primary px-4 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
