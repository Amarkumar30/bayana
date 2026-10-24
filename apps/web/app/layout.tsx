import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { env } from "@/env";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", axes: ["opsz"] });

export const metadata: Metadata = { metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL), title: "Bayana", description: "Advance bookings for independent service businesses" };
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
