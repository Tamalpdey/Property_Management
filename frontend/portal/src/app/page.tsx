import { Features } from "@/components/home/features";
import { Hero } from "@/components/home/hero";
import { Closing, Roles, SiteFooter, WorkTypes } from "@/components/home/sections";
import { SiteHeader } from "@/components/home/site-header";
import { Workflow } from "@/components/home/workflow";

export default function HomePage() {
  return (
    <div id="top" className="bg-maple-ivory font-display text-base leading-[1.7] text-maple-text">
      <SiteHeader />
      <main id="main">
        <Hero />
        <Workflow />
        <Features />
        <Roles />
        <WorkTypes />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  );
}
