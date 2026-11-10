import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trust Manager",
    short_name: "Trust Manager",
    description: "Household financial management for Rwanda and beyond.",
    start_url: "/overview",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#172554",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
