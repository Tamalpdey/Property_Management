import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { pageMetadata, site } from "@/lib/site";
import "./globals.css";

// Self-hosted Plus Jakarta Sans from the design prototype.
const jakarta = localFont({
  variable: "--font-jakarta",
  display: "swap",
  src: [
    { path: "./fonts/jakarta-400.ttf", weight: "400" },
    { path: "./fonts/jakarta-600.ttf", weight: "600" },
    { path: "./fonts/jakarta-700.ttf", weight: "700" },
    { path: "./fonts/jakarta-800.ttf", weight: "800" },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  // Same title and description as the live site, so search listings don't change.
  ...pageMetadata({
    title: "Maple Property Services | Property Maintenance Operations",
    description:
      "Maple Property Services operations, maintenance dispatch, owner communication, and worker field tools.",
    path: "/",
  }),
};

export const viewport: Viewport = {
  themeColor: "#fffefa",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA" data-scroll-behavior="smooth" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
