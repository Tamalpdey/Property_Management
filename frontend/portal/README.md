# Maple public website (frontend/portal)

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
npm ci
npm run dev      # http://localhost:3000
npm run build    # static export to out/ (plain HTML/CSS/JS, no Node server needed)
npm run lint
```

## Deploying

The existing Docker/OVH stack now includes a separate `public-site` service. Its multi-stage
Dockerfile builds Next.js to static files in `out/`, then serves them with Nginx. No Node.js process,
database, or backend credentials are needed at runtime.

Caddy sends `www.maplepropertyservices.ca` to `public-site:80`; the apex domain redirects to the
canonical `www` host, preserving the path and query string. `/login` retains its tenant-login
redirect. Tenant, worker, admin, API, and Platinum website routing remain separate.

### Local build and registry push

From the repository root:

```sh
./deploy/ec2/run-stack.sh prod website-build-push
```

This builds and pushes **only** `public-site` and `edge`, using the existing `IMAGE_PREFIX` and
`IMAGE_TAG` from `deploy/ec2/.env.prod`. Both local and OVH environments must use the same values,
and Docker must be logged into the registry. Use a versioned `IMAGE_TAG` for releases when possible.
The default target is `linux/amd64`, matching the existing OVH deployment.

Build without pushing:

```sh
./deploy/ec2/run-stack.sh prod website-build
```

### Deploy on OVH

First update the server checkout so it contains the new `docker-compose.yml` and `run-stack.sh`.
Keep the server's existing `.env.prod`; do not replace credentials with a local file.

```sh
./deploy/ec2/run-stack.sh prod website-pull-deploy
```

This pulls both images, starts the public site and waits for its health check, then updates Caddy.
It does not restart the backend, tenant portal, worker app, admin portal, or Redis, and it does not
run database migrations. The other stack services must already be running.

For already-pulled images, use `website-deploy`. For later content-only updates, rebuilding and
deploying just `public-site` is sufficient; the first rollout requires **both** images.

### Verify the release

```sh
./deploy/ec2/run-stack.sh prod ps
curl -I https://maplepropertyservices.ca/who-we-are
curl -I https://www.maplepropertyservices.ca/who-we-are
curl -I https://www.maplepropertyservices.ca/does-not-exist
curl -fsS https://www.maplepropertyservices.ca/robots.txt
curl -fsS https://www.maplepropertyservices.ca/sitemap.xml
```

Expected: apex returns `308` to `www`; the about page returns `200`; unknown paths return `404`.
Nginx maps extensionless routes to their exported HTML files and serves the designed `404.html`
with a 404 status. HTML is revalidated on each visit; hashed Next.js assets receive immutable caching.
Cloudflare must not use a rule that caches HTML indefinitely. If such a rule was used for the old
homepage, purge the old homepage HTML after deploying; no new DNS entries are needed.

### Docker preview without the rest of the stack

```sh
docker build --platform linux/amd64 -t maple-public-site:preview -f frontend/portal/Dockerfile frontend
docker run --rm -p 127.0.0.1:3000:80 maple-public-site:preview
```

Open `http://localhost:3000`. The `public-site` service itself has no host port exposed in production.

Deployment-script regression checks (no real Docker commands are executed):

```sh
node deploy/ec2/test-run-stack.mjs
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
