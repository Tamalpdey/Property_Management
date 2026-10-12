import type { MDXComponents } from "mdx/types";

/**
 * Global components for MDX/Markdown content (required by @next/mdx in the App Router).
 * Add a page as `src/app/<route>/page.mdx`, or import a `.md`/`.mdx` file from `src/content/`.
 */
const components: MDXComponents = {};

export function useMDXComponents(): MDXComponents {
  return components;
}
