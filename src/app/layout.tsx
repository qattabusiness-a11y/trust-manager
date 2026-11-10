import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Providers } from "@/components/layout/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Trust Manager", template: "%s · Trust Manager" },
  description: "AI-powered household financial management and budgeting — built for households in Rwanda and beyond.",
  applicationName: "Trust Manager",
  
  icons: { icon: "/icon.png", apple: "/brand/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#172554",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas text-navy">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
