import type { Metadata } from "next";
import {
  AboutHero,
  Deployments,
  Direction,
  Market,
  Measures,
  Principles,
  Solution,
  Vision,
} from "@/components/about/sections";
import { Closing, SiteFooter } from "@/components/home/sections";
import { SiteHeader } from "@/components/home/site-header";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Who we are | Maple Property Services",
  description:
    "Boreal's vision: one secure, multi-tenant platform for service and manufacturing businesses, from quote or order through execution, time capture and invoicing.",
  path: "/who-we-are",
});

export default function WhoWeArePage() {
  return (
    <div id="top" className="bg-maple-ivory font-display text-base leading-[1.7] text-maple-text">
      <SiteHeader />
      <main id="main">
        <AboutHero />
        <Vision />
        <Market />
        <Solution />
        <Principles />
        <Deployments />
        <Direction />
        <Measures />
        <div className="pt-20 max-md:pt-12">
          <Closing />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
