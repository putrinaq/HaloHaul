import type { MetadataRoute } from "next";

/** "Add to Home Screen" opens HaloHaul full-screen, like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HaloHaul",
    short_name: "HaloHaul",
    description: "Your personal buyer across China's platforms.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
