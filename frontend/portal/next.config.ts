import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  // Build to plain static files in `out/` so Caddy can serve the site like the current one.
  output: "export",
  // The image optimizer needs a Node server; static export serves the files as-is.
  images: { unoptimized: true },
  // Hide the Next.js dev tools button in `npm run dev` (it never appears in production).
  devIndicators: false,
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withMDX = createMDX({
  extension: /\.(md|mdx)$/,
});

export default withMDX(nextConfig);
