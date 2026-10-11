# Maple public website (frontend-new)

The public marketing site for maplepropertyservices.ca, rebuilt from the approved design prototype
(Concept B). This project is **only the public website**. The tenant portal, admin portal and worker
app are separate applications under `frontend/` and are not part of it.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4**: design tokens in `src/app/globals.css` (`@theme`)
- **Radix UI primitives**: Accordion (features section), Collapsible (mobile navigation)
- **Lucide React** icons
- **MDX / Markdown** via `@next/mdx`: add content pages as `src/app/<route>/page.mdx`

## Run it

```sh
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to out/ (plain HTML/CSS/JS, no Node server needed)
npm run lint
```

## Deploying

`npm run build` writes the whole site to `out/`: `index.html`, `who-we-are.html`, `404.html`,
`robots.txt`, `sitemap.xml`, images and `_next/` assets. Serve it as static files. The web server must map
`/who-we-are` to `who-we-are.html` and use `404.html` for unknown paths. In Caddy:

```caddy
handle {
  root * /srv/maple-site
  try_files {path} {path}.html
  file_server
}
handle_errors 404 {
  root * /srv/maple-site
  rewrite * /404.html
  file_server
}
```

SEO: canonical URLs and social previews use `https://www.maplepropertyservices.ca` (`src/lib/site.ts`).

## Links

These match the current live site (`deploy/ec2/maple-site/index.html`):

| Link | Destination |
|---|---|
| Tenant Login | https://app.maplepropertyservices.ca/login |
| Worker Login | https://worker.maplepropertyservices.ca/login |
| Features / How it works / Workspaces | sections on the homepage (`/#features` etc., so they work from any page) |
| Who we are | `/who-we-are`, the Boreal vision statement |

The page title and meta description are also carried over from the live site.

## Project layout

```
src/
  app/                layout (self-hosted Plus Jakarta Sans), homepage, globals.css
  components/home/    header, hero, scroll story, features, workspaces, work types, footer
  app/who-we-are/     "Who we are" page
  components/about/   its sections (vision, market, solution, principles, deployments, direction, measures)
  content/home.ts     all homepage copy and link destinations in one place
  content/who-we-are.ts  "Who we are" copy, from the Boreal Vision Statement (Oct 4, 2026)
  lib/cn.ts           class-name helper (clsx + tailwind-merge)
  mdx-components.tsx  global components for MDX content
public/images/        editorial photos from the design prototype
```
