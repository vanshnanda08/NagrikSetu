import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NagrikSetu — Civic complaints",
    short_name: "NagrikSetu",
    description: "Report civic problems and follow the municipality's response.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f4f7f8",
    theme_color: "#0b3b5e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/nagriksetu-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/nagriksetu-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Report a problem", short_name: "Report", url: "/report" },
      { name: "My reports", short_name: "My reports", url: "/me/reports" },
    ],
  };
}
