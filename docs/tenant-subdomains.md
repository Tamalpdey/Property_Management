# Tenant subdomains

Tenant onboarding assigns one portal key, for example `acme`. Production then serves:

- `https://acme.app.maplepropertyservices.ca` for tenant operations
- `https://acme.worker.maplepropertyservices.ca` for field workers

## DNS

Create these wildcard records at the DNS provider:

| Type | Name | Target |
| --- | --- | --- |
| CNAME | `*.app` | `app.maplepropertyservices.ca` |
| CNAME | `*.worker` | `worker.maplepropertyservices.ca` |

An `A` record pointing both wildcard names directly to the EC2 public IP is also valid. When Cloudflare is the DNS provider, the recommended setup is two **DNS only** `A` records pointing directly to EC2. Use wildcard CNAME records only when their target is also DNS only. Cloudflare proxying requires an edge certificate that covers nested hostnames such as `*.app.maplepropertyservices.ca` and `*.worker.maplepropertyservices.ca`.

## Caddy and TLS

The production Caddyfile contains wildcard tenant and worker routes. TLS certificates are issued on demand for individual tenant hostnames. Before Caddy requests a certificate, it calls the backend allow endpoint; the backend returns success only when:

- the hostname ends in `.app.<root-domain>` or `.worker.<root-domain>`;
- the first label is a valid portal subdomain; and
- that subdomain belongs to a tenant in `TRIAL`, `ACTIVE`, or `PAST_DUE` status.

Set the same root domain in both deployment variables:

```dotenv
ROOT_DOMAIN=maplepropertyservices.ca
LORNE_PUBLIC_ROOT_DOMAIN=maplepropertyservices.ca
```

After changing DNS or the Caddyfile, rebuild and restart the edge and backend services:

```bash
docker compose --env-file .env.prod up -d --build edge lorne-modulith tenant-portal worker-app
```

No Caddy change is required when another tenant is onboarded. The tenant record and wildcard DNS cover new portal keys automatically.

## Login routing

Production login and refresh requests are bound to the original request hostname:

- tenant administrators, operations, and finance users sign in at `https://<tenant>.app.maplepropertyservices.ca`;
- field workers sign in at `https://<tenant>.worker.maplepropertyservices.ca`;
- super administrators sign in at `https://admin.maplepropertyservices.ca`.

The backend resolves the tenant from the hostname and verifies that it matches the tenant ID loaded by the login page. Generic `app` and `worker` hostnames cannot be used for production login, and a session issued for one tenant cannot be refreshed through another tenant hostname. Localhost remains available for local development.

A `403` on a valid tenant hostname means either that the account is not assigned to that tenant or that the account role does not belong to that portal. For example, a tenant administrator must use the tenant `app` URL, not the `worker` URL.
