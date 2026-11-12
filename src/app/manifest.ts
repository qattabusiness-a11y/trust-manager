import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Trust Manager",
    short_name: "Trust Manager",
    description: "Household money made simple: budget, spending, savings and an AI assistant, built for Rwanda.",
    start_url: "/overview?source=app",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#FFFFFF",
    theme_color: "#172554",
    lang: "en",
    categories: ["finance", "productivity", "lifestyle"],
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add a transaction", short_name: "Add", url: "/transactions", icons: [{ src: "/brand/icon-192.png", sizes: "192x192" }] },
      { name: "My budget", short_name: "Budget", url: "/budget", icons: [{ src: "/brand/icon-192.png", sizes: "192x192" }] },
      { name: "Shopping list", short_name: "Shopping", url: "/shopping", icons: [{ src: "/brand/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
