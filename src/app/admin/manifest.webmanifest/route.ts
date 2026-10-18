// The admin console as its own installable app ("Add to Home Screen" on the
// phone opens the Actions board full-screen). The customer site keeps the root
// manifest.

export function GET() {
  return Response.json(
    {
      name: "HaloHaul Admin",
      short_name: "HH Admin",
      description: "HaloHaul admin console",
      start_url: "/admin",
      scope: "/admin",
      display: "standalone",
      background_color: "#000000",
      theme_color: "#000000",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" } },
  );
}
