import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteFooter } from "@/components/home/sections";
import { SiteHeader } from "@/components/home/site-header";
import { Eyebrow, buttonClass, container } from "@/components/home/primitives";

export const metadata: Metadata = {
  title: "Page not found | Maple Property Services",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div id="top" className="bg-maple-ivory font-display text-base leading-[1.7] text-maple-text">
      <SiteHeader />
      <main id="main" className="px-5 max-lg:px-3">
        <div className="rounded-[34px] bg-maple-shell py-28 text-center max-md:rounded-[22px] max-md:py-20">
          <div className={container}>
            <Eyebrow>PAGE NOT FOUND</Eyebrow>
            <h1 className="text-[clamp(2.2rem,4.4vw,4rem)] leading-[1.08] font-semibold tracking-[-0.06em] text-maple-ink">
              This page has moved
              <br />
              <span className="text-maple-teal">or never existed.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-[520px] text-maple-muted">
              Head back to the homepage, or sign in to your workspace from the menu above.
            </p>
            <Link href="/" className={`${buttonClass} mt-8`}>
              <ArrowLeft aria-hidden className="mr-3 size-4" /> Back to homepage
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
