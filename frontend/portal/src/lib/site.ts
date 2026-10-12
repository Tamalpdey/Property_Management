import type { Metadata } from "next";

/** Site-wide SEO values. Page metadata replaces (not merges) `openGraph`/`twitter`, so pages use `pageMetadata`. */
export const site = {
  url: "https://www.maplepropertyservices.ca",
  name: "Maple Property Services",
  image: { url: "/images/field-editorial.jpg", width: 1536, height: 1024, alt: "A Maple field technician at a property" },
};

export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: site.name,
      locale: "en_CA",
      url: path,
      title,
      description,
      images: [site.image],
    },
    twitter: { card: "summary_large_image", title, description, images: [site.image.url] },
  };
}
