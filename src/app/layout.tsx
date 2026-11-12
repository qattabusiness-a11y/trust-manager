import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Providers } from "@/components/layout/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Trust Manager", template: "%s · Trust Manager" },
  description: "AI-powered household financial management and budgeting — built for households in Rwanda and beyond.",
  applicationName: "Trust Manager",
  icons: {
    icon: [{ url: "/icon.png" }, { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // iPhone: open full-screen from the home screen, with this name under the icon.
  appleWebApp: { capable: true, title: "Trust Manager", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#172554",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas text-navy">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
