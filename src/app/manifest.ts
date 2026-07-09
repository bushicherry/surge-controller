import type { MetadataRoute } from "next";

/**
 * Web App Manifest. Rendered at /manifest.webmanifest.
 *
 * The `start_url: "/"` combined with `display: "standalone"` makes
 * "Add to Home Screen" on iOS/Android launch the app full-screen (no browser
 * chrome), which is the whole point of PWA installation on the phone.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Surge Controller",
    short_name: "Surge",
    description: "Remote control panel for Surge Mac on your LAN.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#090b12",
    theme_color: "#090b12",
    icons: [
      { src: "/icon",       sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon",       sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
