"use client";

import { useEffect, useRef } from "react";

/**
 * Once-only scroll reveal. Content is visible by default; it only starts hidden
 * after JS adds `motion-ready` to <body>, and reduced-motion users never see it hidden.
 */
export function Reveal({
  as: Tag = "div",
  className,
  children,
}: {
  as?: "div" | "article" | "section";
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches || !("IntersectionObserver" in window)) {
      el.dataset.visible = "true";
      return;
    }
    document.body.classList.add("motion-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.dataset.visible = "true";
            observer.disconnect();
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -35px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref} data-reveal="" className={className}>
      {children}
    </Tag>
  );
}
