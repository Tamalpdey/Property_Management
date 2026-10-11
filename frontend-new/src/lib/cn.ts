import clsx, { type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the project's custom breakpoints so responsive overrides merge correctly.
const twMerge = extendTailwindMerge({
  override: { theme: { breakpoint: ["md", "lg", "xl", "2xl"] } },
});

/** Join class names; later Tailwind utilities override conflicting earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
