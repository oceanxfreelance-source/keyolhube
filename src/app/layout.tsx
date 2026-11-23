import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OceanX Studio",
  description: "Design posters, social posts, jerseys and more, in English and Dhivehi.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111215" };

// Applies the saved theme before first paint so there is no flash of the wrong theme.
const themeScript = `try{var t=localStorage.getItem("theme");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
