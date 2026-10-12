import Link from "next/link";
import { Leaf } from "lucide-react";
import { Reveal } from "./reveal";
import { cn } from "@/lib/cn";

export const container = "mx-auto w-full max-w-[1280px] px-8 max-md:px-[22px]";

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Maple home"
      className={cn(
        "flex items-center gap-1.5 text-[1.65rem] font-extrabold tracking-[-0.065em] text-maple-ink no-underline max-md:text-2xl",
        className,
      )}
    >
      <Leaf aria-hidden className="size-6 fill-maple-ink" />
      <span>Maple</span>
    </Link>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "mb-5 block text-[0.66rem] leading-normal font-extrabold tracking-[0.15em] text-[#58695f]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Section title. `muted` renders as the softer second line used throughout Concept B. */
export function SectionHeading({
  eyebrow,
  title,
  muted,
  intro,
  center,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  muted?: React.ReactNode;
  intro?: string;
  center?: boolean;
  className?: string;
}) {
  return (
    <Reveal className={cn("mb-16 max-md:mb-[35px]", center && "text-center", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-[15px] mb-6 text-[clamp(2rem,3.8vw,3.5rem)] leading-[1.13] font-semibold tracking-[-0.055em] text-maple-ink">
        {title}
        {muted && (
          <>
            <br />
            <span className="text-[#6a7870]">{muted}</span>
          </>
        )}
      </h2>
      {intro && (
        <p className={cn("max-w-[620px] text-[1.1rem] text-maple-muted max-md:text-base", center && "mx-auto")}>
          {intro}
        </p>
      )}
    </Reveal>
  );
}

const buttonBase =
  "inline-flex items-center rounded-[10px] border border-maple-teal bg-maple-teal font-bold text-white no-underline shadow-[0_3px_0_#123d2110] transition hover:-translate-y-0.5 hover:border-maple-teal-dark hover:bg-maple-teal-dark active:scale-[0.985]";
export const buttonClass = `${buttonBase} px-[22px] py-[13px] text-[0.85rem]`;
export const buttonLargeClass = `${buttonBase} px-[25px] py-[18px] text-base max-md:px-[17px] max-md:py-3.5 max-md:text-[0.81rem]`;

export const textLinkClass =
  "group inline-flex items-center gap-3 text-[0.9rem] font-bold text-maple-teal underline underline-offset-[5px] hover:text-maple-teal-dark";

export const linkIconClass =
  "size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5";

export function Caption({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <figcaption
      className={cn("mt-[18px] text-center text-[0.72rem] leading-normal tracking-[0.01em] text-[#69757b]", className)}
    >
      {children}
    </figcaption>
  );
}

export { Reveal };
