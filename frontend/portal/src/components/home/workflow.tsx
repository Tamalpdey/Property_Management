"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stages, type SceneId } from "@/content/home";
import { ProductCard } from "./product-card";
import { Caption, Eyebrow, SectionHeading, container } from "./primitives";
import { cn } from "@/lib/cn";

const pad = (n: number) => String(n + 1).padStart(2, "0");

/**
 * Six-chapter scroll story. On wide screens a sticky scene follows the chapter
 * nearest the viewport centre; buttons jump to a chapter. Native scrolling is never
 * intercepted. Below 1200px (or with reduced motion) chapters show their own scene.
 */
export function Workflow() {
  const [selected, setSelected] = useState(0);
  const chapterRefs = useRef<(HTMLElement | null)[]>([]);
  const requested = useRef<number | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const follow = useCallback(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (window.innerWidth < 1200 || reduced || requested.current !== null) return;
    let nearest = 0;
    let distance = Infinity;
    chapterRefs.current.forEach((chapter, n) => {
      if (!chapter) return;
      const rect = chapter.getBoundingClientRect();
      const d = Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);
      if (d < distance) {
        distance = d;
        nearest = n;
      }
    });
    setSelected(nearest);
  }, []);

  useEffect(() => {
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        follow();
      });
    };
    const release = () => {
      requested.current = null;
      clearTimeout(releaseTimer.current);
      schedule();
    };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) release();
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("scrollend", release);
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchstart", release, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", release);
    schedule();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("scrollend", release);
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchstart", release);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", release);
      clearTimeout(releaseTimer.current);
    };
  }, [follow]);

  const choose = (n: number) => {
    clearTimeout(releaseTimer.current);
    requested.current = n;
    setSelected(n);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    chapterRefs.current[n]?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "center" });
    releaseTimer.current = setTimeout(() => {
      requested.current = null;
    }, 1500);
  };

  return (
    <section id="workflow" className="bg-maple-ivory pt-[105px] pb-20 max-lg:py-20 max-md:py-16">
      <div className={container}>
        <SectionHeading
          center
          eyebrow="HOW IT WORKS"
          title="One connected journey."
          muted="Every detail comes along."
          intro="From the first assignment to the final invoice."
        />

        <div className="grid grid-cols-[35%_60%] items-start gap-[5%] max-xl:block motion-reduce:block">
          <div className="max-xl:grid max-xl:grid-cols-2 max-xl:gap-[38px] max-md:block motion-reduce:grid motion-reduce:grid-cols-2 motion-reduce:gap-9 max-md:motion-reduce:block">
            {stages.map((stage, n) => (
              <article
                key={stage.label}
                id={`stage-${n}`}
                ref={(el) => {
                  chapterRefs.current[n] = el;
                }}
                className="flex min-h-[420px] scroll-mt-[140px] flex-col justify-center py-[45px] max-xl:min-h-0 max-xl:py-6 max-md:pt-7 max-md:pb-10 max-md:[&+&]:border-t max-md:[&+&]:border-maple-line motion-reduce:min-h-0"
              >
                <Eyebrow className="mb-4">
                  {pad(n)} / {stage.label.toUpperCase()}
                </Eyebrow>
                <h3 className="max-w-[340px] text-[2.1rem] leading-[1.15] font-semibold tracking-[-0.045em] text-maple-ink max-xl:max-w-none max-md:text-[1.75rem]">
                  {stage.title}
                </h3>
                <p className="mt-2 max-w-[325px] leading-[1.9] text-maple-muted max-xl:max-w-none max-md:mb-0 max-md:text-[0.92rem]">
                  {stage.body}
                </p>
                <figure className="mt-auto hidden pt-6 max-xl:block max-md:pt-[25px] motion-reduce:block">
                  <ProductCard scene={n as SceneId} className="max-w-[430px] max-md:max-w-none" />
                  <Caption>Illustrative product concept · Fictional data</Caption>
                </figure>
              </article>
            ))}
          </div>

          <div className="sticky top-[90px] max-xl:hidden motion-reduce:hidden">
            <div className="mb-[13px] grid grid-cols-6" aria-label="Choose workflow stage">
              {stages.map((stage, n) => (
                <button
                  key={stage.label}
                  type="button"
                  aria-pressed={selected === n}
                  onClick={() => choose(n)}
                  className={cn(
                    "flex min-h-11 flex-col items-center gap-[5px] rounded-lg px-0.5 py-[9px] text-[0.62rem] font-bold transition-colors",
                    selected === n ? "bg-[#eaf0e5] text-maple-teal" : "text-maple-muted hover:text-maple-ink",
                  )}
                >
                  <span className="text-[0.65rem] text-[#68746b]">{pad(n)}</span>
                  {stage.label}
                </button>
              ))}
            </div>
            <div aria-hidden className="mb-5 h-0.5 overflow-hidden bg-[#e5e8df]">
              <span
                className="block h-full w-full origin-left bg-maple-teal transition-transform duration-400"
                style={{ transform: `scaleX(${(selected + 1) / stages.length})` }}
              />
            </div>
            <div className="grid rounded-3xl bg-[#e9eee7] px-9 py-[25px]">
              {stages.map((stage, n) => {
                const active = selected === n;
                const Icon = stage.icon;
                return (
                  <div
                    key={stage.label}
                    data-active={active}
                    aria-hidden={!active}
                    className={cn(
                      "col-start-1 row-start-1 flex min-h-[430px] flex-col justify-center transition-[opacity,transform,visibility] duration-400",
                      active ? "visible opacity-100" : "pointer-events-none invisible translate-y-3.5 opacity-0",
                    )}
                  >
                    <span className="mb-5 block text-[0.58rem] tracking-[0.13em] text-[#5d6b61]">
                      CEDAR HOUSE / ONE CONNECTED JOB
                    </span>
                    <ProductCard scene={n as SceneId} className="mx-auto w-full max-w-[370px]" />
                    <span className="mt-5 flex items-center gap-2 text-[0.66rem] text-[#526459]">
                      <Icon aria-hidden className="size-3.5" /> {stage.label}
                      <span className="ml-auto text-[0.6rem]">{pad(n)} / 06</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-[18px] text-center text-[0.72rem] text-[#69757b]">
              Illustrative product concept · Fictional data
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
