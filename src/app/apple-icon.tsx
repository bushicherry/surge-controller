import { ImageResponse } from "next/og";

// iOS home-screen icon. iOS ignores the manifest for its own launcher icon
// and looks specifically at /apple-icon (or <link rel="apple-touch-icon">).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
          fontSize: 128,
        }}
      >
        ⚡
      </div>
    ),
    { ...size }
  );
}
