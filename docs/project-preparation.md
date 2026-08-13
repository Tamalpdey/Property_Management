# Lorne Property Management Platform - Project Preparation

Source reviewed: `/Users/nikeshkhandelwal/Downloads/Platinum services requirement.docx`

## Product Summary

Lorne is planned as a multi-tenant SaaS platform for property maintenance and field service companies. The platform should help businesses manage customers, properties, field workers, work orders, schedules, photos, customer communication, invoicing, payroll validation, inventory, and operational reporting.

The software owner operates as the Super Administrator across all tenants. Each subscribing company is a tenant with isolated users, properties, workers, financial records, documents, and settings.

## Target Users

- Super Administrator: manages tenants, plans, platform metrics, system settings, usage, and cross-tenant visibility.
- Tenant Administrator: manages one company's profile, workers, customers, properties, service catalog, operations, finance users, and reporting.
- Operations Team: creates and schedules work orders, assigns workers, monitors field progress, validates completed work, approves labour hours, and reviews productivity.
- Finance Team: generates invoices, tracks payments, validates payroll, communicates with customers, and reviews financial reports.
- Field Worker: uses a mobile-first workflow to view assigned jobs, clock in, travel, start work, capture photos, record breaks, complete jobs, and review payroll.
- Property Owner / Customer: receives service emails, views completed work and invoices, requests quotes, and reviews service history.

## Core Functional Scope

The central business object is the work order. Its intended lifecycle is:

1. Created
2. Scheduled
3. Worker assigned
4. Worker travels
5. Worker arrives
6. Work started
7. Work completed
8. Supervisor approved
9. Customer notified
10. Invoice generated
11. Payment received

Primary modules from the BRD:

- Authentication and authorization with secure login, MFA, password reset, JWT/session handling, and role-based permissions.
- Property management with customer ownership, service plans, access instructions, notes, photos, service history, revenue, and invoices.
- Work order management with scheduling, assigned workers, task lists, materials, estimated and actual time, notes, photos, status, and approval.
- Field worker mobile experience with clock-in, travel, arrival, work, breaks, evidence upload, completion, and payroll visibility.
- Photo evidence management with structured before/after job photos and Cloudflare R2-backed object storage.
- Automated customer communication after job completion.
- Operations dashboards for live workforce state, daily job board, approvals, and productivity.
- Finance system for labour/material/tax invoice generation, payment tracking, and reports.
- Payroll validation for approved hours, travel time, breaks, completed tasks, and pay calculation.
- Worker profiles with personal, emergency, employment, certification, pay, and document details.
- Asset and inventory management for vehicles, chemicals, equipment, supplies, and materials.
- Notifications through email initially, with push and SMS as later enhancements.

## Current Repository Fit

The current `Lorne` repository already has a strong frontend prototype:

- React, TypeScript, Vite, Material UI, Recharts.
- Role-specific routes for Super Admin, Tenant Admin, Operations, Finance, Field Worker, and Customer Portal.
- Demo screens for dashboards, work orders, schedules, approvals, notifications, reports, properties, workers, assets, inventory, audit logs, invoices, payments, payroll, job history, and customer portal views.
- Shared `WorkOrdersContext` used across several role views for in-memory work order updates.
- Seed CSV files under `supabase/csv` with `tenant_id` fields for core demo data.
- A Supabase client exists, but most UI data still comes from local mock data.

Important mismatch:

- The current repo is frontend-only and includes Supabase scaffolding, not a Spring Boot backend.
- The production backend direction is now Spring Boot 4.1.0 + Spring Modulith + PostgreSQL.
- Supabase CSV files should be treated as useful seed/reference data, not the production backend architecture.
- The current React single-app prototype should become a split Angular workspace like `adh-catalog`: a tenant application, a platform-admin application, and a dedicated worker application for mobile/tablet field operations.

## Reference Project Findings

Use `/Applications/SourceCode/adh-catalog` as the implementation reference, not only `/Applications/SourceCode/adh-catalog/backend`.

Relevant structure:

```text
adh-catalog/
├── backend/
│   └── modules/
│       ├── adh-common/
│       └── adh-modulith/
├── db-migration/
├── deploy/
│   └── ec2/
└── frontend/
    ├── admin-portal/
    ├── catalog-portal/
    ├── marketing-site/
    └── packages/
```

Key patterns to copy for Lorne:

- Separate frontend applications for tenant users and platform administrators.
- Shared frontend packages only for stable contracts/design primitives, not copied feature code.
- One Spring Modulith backend jar.
- One separate database migration project.
- One EC2 deployment stack with Caddy as the public edge proxy.
- Backend, Redis, rendering/worker services, and databases stay private on the Docker network.
- Caddy routes `/api/v1/*` to Spring Boot and all other traffic to the correct frontend container.
- Docker helper scripts should prevent private services from exposing host ports.

## Recommended Architecture Direction

Use the same structural style as `/Applications/SourceCode/adh-catalog`, adapted to the Lorne domain:

- Tenant frontend: Angular, PrimeNG, Tailwind, standalone components, lazy routes, signals, route guards, and HTTP interceptors.
- Platform admin frontend: separate Angular, PrimeNG, Tailwind application for software-owner/super-admin functions.
- Frontend version target: use Angular 21 + PrimeNG 21 + Tailwind 4 to stay aligned with the current `adh-catalog` portal stack while still using modern standalone components, signals, lazy routes, and typed contracts.
- Backend: Spring Boot 4.1.0 modular monolith using Spring Modulith.
- Java: Java 25 toolchain and runtime.
- Build: Gradle Kotlin DSL multi-project layout.
- Runtime application project: one deployable Spring Boot jar for the Modulith backend.
- Shared project: one `common` library for cross-cutting code only.
- Database migration project: top-level separate migration-only project for PostgreSQL schema ownership and repeatable deployment.
- Database: PostgreSQL with shared schema and mandatory `tenant_id` on tenant-owned tables.
- Auth: Spring Security with JWT, tenant-aware claims, role/permission registry, and method security.
- Storage: Cloudflare R2 object storage through its S3-compatible API, with tenant/property/work-order key prefixes.
- Email: Amazon SES for completion reports, invoices, password flows, and operational notifications.
- Notifications: start with email and in-app notifications; add SNS/push/SMS later.
- Observability: CloudWatch logs, metrics, and alerts.

Spring Modulith keeps deployment simple while still enforcing module boundaries. Each business area should be a top-level package module with an explicit public API, private `internal` implementation packages, and verified dependencies. Future microservice extraction should happen by replacing a facade implementation with an HTTP/client adapter, not by rewriting callers.

The current Spring documentation lists Spring Boot 4.1.0 as stable. Spring Boot 4.1.0 requires at least Java 17 and is compatible through Java 26, so Java 25 is a supported target. Frontend implementation uses the Angular 21 + PrimeNG 21 parity baseline from `adh-catalog`.

## Workspace Layout

Create a workspace that mirrors `adh-catalog`:

```text
property-management/
├── backend/
│   ├── settings.gradle.kts
│   ├── build.gradle.kts
│   ├── gradle.properties
│   ├── lombok.config
│   └── modules/
│       ├── lorne-common/
│       └── lorne-modulith/
├── db-migration/
├── deploy/
│   └── ec2/
├── frontend/
│   ├── tenant-portal/
│   ├── admin-portal/
│   ├── worker-app/
│   └── packages/
└── docs/
```

Recommended backend Gradle projects:

- `lorne-common`: reusable cross-cutting code only, with no bootable jar. Examples: API response wrappers, exception hierarchy, tenant context, auditing base entity, CORS properties, Jackson config, security entry points, access-denied handler, and validation helpers.
- `lorne-modulith`: the Spring Boot 4.1.0 application. It depends on `lorne-common`, owns REST APIs, domain modules, services, repositories, Modulith events, and integration adapters.

Recommended top-level projects:

- `db-migration`: standalone Flyway migration runner for PostgreSQL. Keep it independent of the Spring Boot jar.
- `frontend/tenant-portal`: the actual tenant application used by tenant admins, operations, and finance users.
- `frontend/admin-portal`: the software-owner/platform-admin application for tenants, plans, system health, audit, support, and runtime controls.
- `frontend/worker-app`: the dedicated mobile/tablet application used by field workers.
- `frontend/packages`: shared generated API clients, route/permission constants, typed contracts, and small design tokens. Do not duplicate feature implementations between portals.
- `deploy/ec2`: Caddy, Docker Compose, local/prod Caddyfiles, env examples, and stack helper scripts.

Use the catalog backend as the style guide:

- Keep `settings.gradle.kts` small and explicit.
- Put shared dependency versions in the root `build.gradle.kts`.
- Use Java 25 toolchains consistently.
- Disable `bootJar` for common and migration-only projects.
- Name the boot jar predictably, for example `lorne-modulith.jar`.
- Keep environment-driven configuration in `application.yml`.
- Use `ddl-auto: validate`; schema changes must come from migrations.

## Angular Frontend Plan

Model this after `frontend/catalog-portal` and `frontend/admin-portal` in `adh-catalog`.

Tenant portal responsibilities:

- Tenant Admin: company setup, users, workers, property owners, properties, service catalog, settings, reports.
- Tenant user management is the primary tenant-admin workflow for login accounts, role assignment, temporary passwords, password resets, common contact details, and active/disabled status. Tenant admins should add Operations, Finance, Tenant Admin, Field Worker, and future Customer Portal users from a central Users screen.
- Worker onboarding is a tenant-admin/operations workflow for the field-operational profile: employment/pay info, emergency contacts, certifications, service skills, shifts, equipment/tool assignment, and active/inactive status. A Field Worker user must always have a linked worker profile; if no profile is selected during user creation, the backend should create one automatically. Linked worker lists should prefer app-user common contact details so the UI does not drift between duplicate name/email/phone values.
- Operations: dashboard, work orders, schedule, approvals, worker status, inventory, equipment/tool assignment, customer notifications, purchase orders.
- Finance: invoices, payments, payroll validation, finance reports.
- Customer: property list, completed work, invoices, messages, quote requests if enabled.

Worker app responsibilities:

- Separate mobile/tablet-first Angular app for field workers.
- Worker login, today's jobs, travel, arrival, work start, breaks, photos, issue reporting, completion, payroll/profile.
- No desktop admin navigation, dense tables, finance screens, or tenant setup surfaces.
- Optimized as a future installable PWA so workers can use phones or iPads/tablets without carrying laptops.

Admin portal responsibilities:

- Platform dashboard.
- Tenant management and tenant health.
- Subscription plans and feature gates.
- Runtime controls and global settings.
- User management.
- Audit logs.
- Notifications/announcements.
- Support console.
- System health and deployment readiness.
- Platform analytics.

Angular implementation rules:

- Use standalone components by default.
- Use lazy route `loadComponent`/`loadChildren` for every feature area.
- Split large screens into smaller focused components early. Containers should coordinate data loading/state, while child components render cards, lists, steppers, action bars, forms, and tables. Avoid building "god components" that mix API calls, state transitions, layout, and all markup in one file.
- Use `provideRouter`, `provideHttpClient(withInterceptors(...))`, `providePrimeNG`, and async animations in `app.config.ts`.
- Use route guards for auth, tenant status, role permissions, and feature-plan gates.
- Use HTTP interceptors for JWT, tenant ID, request correlation ID, subscription/plan-limit handling, and standardized API errors.
- Use Angular signals and computed state for component/local UI state.
- Use NgRx Signal Store or lightweight services only where shared async domain state is truly needed. Do not add global NgRx store for every screen by default.
- Use PrimeNG components for tables, forms, dialogs/drawers, menus, toasts, date pickers, file uploads, tabs, cards, badges, charts integration, and data-heavy admin workflows.
- Use Tailwind for layout, spacing, responsive behavior, and local composition around PrimeNG components.
- Use PrimeIcons, not emoji glyphs or mixed icon systems.
- Generate TypeScript API clients and DTOs from Spring OpenAPI instead of manually duplicating backend contracts.
- Keep field-worker screens mobile and tablet-first. Workers should not need a laptop for daily operations.
- Make field-worker workflows tap-first: large action buttons, segmented status steps, quick-select chips, checklists, camera/file controls, GPS/time auto-capture, and confirmation dialogs instead of free-text-heavy forms.
- Require typing only when the data cannot reasonably be selected or captured automatically, such as exception notes, damage notes, customer-specific comments, or rejection reasons.
- Use sensible defaults from the work order: property, service type, assigned worker, scheduled time, task list, materials, customer contact, and tax/service settings should be prefilled wherever possible.
- Optimize for phones and iPads/tablets with responsive breakpoints, touch targets, sticky bottom action bars, offline draft preservation, retryable uploads, and portrait/landscape layouts.
- For the first implementation pass, prioritize Super Admin login/admin dashboard and Field Worker login/mobile today flow. These are the two journeys that should become real before broad tenant-admin, finance, and operations CRUD screens.
- Keep tenant portal and worker app separate. Tenant users manage owners, properties, services, schedules, approvals, finance, and workers; field workers execute assigned jobs in the dedicated worker app.

Frontend product design direction:

- Treat the UI as a corporate operations product, not a scaffold or marketing page. Use dense but readable layouts, clear page framing, strong hierarchy, restrained cards, and predictable navigation.
- Tenant portal should make the business model visible: owner records connect to managed properties, managed properties connect to service profiles, and service catalog items drive work orders and worker checklists.
- Tenant portal should include inventory and equipment management: consumable products/materials stay in inventory, while durable tools/equipment/vehicles stay as assets that can be assigned to workers.
- Tenant portal list screens must be designed for portfolio scale, not demo scale. Expect hundreds of property owners, thousands of properties, many service types, and many workers. Use search, filters, compact rows/cards, stable sort order, count summaries, and eventually server-side paging/filter APIs.
- For production-scale operations, tenant screens need a dense table/list mode in addition to card views. Owners, properties, workers, services, inventory, assets, and work orders should support server-side search, filters, sort, pagination, saved views, bulk actions, import/export, and drill-in detail pages.
- MVP collection screens can use shared client-side dense tooling for search, sort, page size, pagination, selection count, and bulk action placeholders. Before importing real tenant portfolios, replace these with server-side query contracts so 400 owners, 1000+ properties, and large work-order histories remain fast.
- Tenant collection screens should default to compact tables with pagination pinned below the result set, not crowded into the header toolbar. Create/update forms should open in modal dialogs from explicit Add or row action buttons, while row kebab actions should expose contextual operations such as update, deactivate, worker assignment, and property service-profile assignment.
- Work orders are placed against an owner and property. The owner should remain visible in the intake UI, while the selected property provides address/access context and property-specific services. The work order itself is the operational task/job; optional checklist rows can exist later for field execution detail, but they should not become the primary tenant-admin model.
- Work orders must be editable throughout their lifecycle. Tenant admins should be able to save a draft, update owner/property/service/status/schedule, add or change workers, and attach inventory/materials/tools/equipment at any time. Multiple workers may be assigned to the same work order, with one lead worker and an assignment lifecycle so contractor participation, reassignment, emergency leave, pause, release, and completion are auditable events rather than hidden notes.
- Work-order intake must track source: recurring schedule, adhoc phone call, tenant portal, website, or customer portal. Website/customer-submitted work should default to pending review, while tenant-created work can start as to-do. Recurrence metadata belongs on the parent work order and generated occurrences should remain linked to the recurrence parent.
- Recurring maintenance should be modeled as a recurring work template, not as one manually edited work order. The template should hold owner/property/service/frequency/default duration/default materials/default worker rules. A scheduler should generate draft work orders ahead of time, initially one week before the service date, so operations can review availability, assign workers, adjust materials/tools, and publish the job.
- Every work order needs a tenant-unique alphanumeric tracking code, and recurring generation must show the created draft receipt with property, service, occurrence date, and scheduled window so operations can search, audit, and dispatch confidently.
- Work-order audit must capture every tenant/admin/worker mutation with before/after details for core fields, scheduling, status, worker assignment, materials, tools/equipment, and checklist execution so disputes, emergency reassignment, billing, and quality review have a reliable timeline.
- Worker assignment should be availability-driven from the selected service and schedule window. The tenant UI can show client-side availability hints during MVP, but production needs a backend availability endpoint that considers worker skills, full-time/contractor rules, shift templates, existing work orders, time off, travel/route buffers, emergency leave, and equipment constraints before allowing assignment.
- The worker app must be calendar-first for phones and tablets, showing past, current, and future assigned jobs. Each job should support tap-first field execution: start travel, arrive, start work, pause/resume, complete, checklist completion, Cloudflare R2 photo capture through presigned upload URLs, notes, materials used, tool return, and audit for every tap.
- Property screens should show owner mapping, address/access context, active status, and assigned or inferred service coverage at a glance. The MVP can derive temporary service badges from notes until explicit property-service assignment APIs are implemented.
- Worker app should feel like a dedicated field tool: high contrast, large tap targets, sticky primary actions, step buttons, checklist toggles, route/photo/call quick actions, and minimal text entry.
- Platform admin should feel distinct from tenant operations with a console-style layout for tenant health, runtime controls, subscriptions, audit, and support readiness.
- Login screens are part of the product surface and should carry the same role-specific visual language as the app behind them.

Version baseline:

- Current implementation baseline: Angular 21, PrimeNG 21, Tailwind 4, TypeScript 5.9.x, Node `^20.19.0 || ^22.12.0 || ^24.0.0`, matching the current `adh-catalog` portal stack.
- Keep frontend apps small and role-specific: `admin-portal` for platform administrators, `tenant-portal` for tenant administrators/operations/finance, and `worker-app` for field workers.

## Java 25 Backend Guidelines

Use Java 25 deliberately, not decoratively:

- Enable Spring virtual threads for request handling where supported.
- Keep JDBC/JPA workloads bounded by the database connection pool; do not create extra application thread pools for blocking database access.
- Use virtual-thread-per-task executors for bounded fan-out work such as parallel external API calls, report artifact generation coordination, or notification dispatch batches.
- Do not pool virtual threads. Use semaphores/rate limiters or provider-specific concurrency limits when an external service must be throttled.
- Use enums for stable domain states: work order status, priority, assignment state, worker status, invoice status, payment status, payroll status, tenant status, plan type, notification channel.
- Prefer enhanced switch expressions over scattered `if/else` status logic.
- Prefer records for immutable DTO projections and internal command/result carriers when JPA entity requirements do not apply.
- Use lambdas and method references for small transformations, but keep business workflows readable in named methods/services.
- Avoid duplicate mapper/business logic across modules. Shared mapping belongs in a module facade/adapter or generated API client, not copy-pasted helpers.
- Keep entity state transitions inside the owning aggregate/module.

## Spring Modulith Package Plan

Root package proposal:

```text
com.lorne.platform/
├── LorneApplication.java
├── auth/
├── tenant/
├── customer/
├── property/
├── worker/
├── workorder/
├── schedule/
├── fieldwork/
├── document/
├── notification/
├── finance/
├── payroll/
├── inventory/
├── asset/
├── analytics/
├── superadmin/
├── integration/
└── shared/
```

Module rules:

- Each top-level business package gets a root `package-info.java` with `@ApplicationModule`.
- Each module exposes only a facade interface or clearly named public events from the root package.
- Controllers, services, entities, repositories, DTOs, mappers, and adapters live under `internal`.
- Other modules must not import from another module's `internal` package.
- Use `@NamedInterface("api")` sparingly when an internal DTO/event package must be shared.
- Keep `shared` open for stable primitives only: base entities, common exceptions, tenant context, event envelopes, audit constants, and small value objects.
- Add an `ApplicationModules.verify()` test immediately and keep it in CI.

Initial module responsibilities:

- `auth`: login, registration/invitation, password reset, JWT, token revocation, user-role mapping, method security helpers.
- `tenant`: tenant profile, tenant settings, subscription status references, tenant lifecycle.
- `customer`: property owner/customer records and contact preferences.
- `property`: properties, access instructions, service plans, site notes, photos/documents metadata.
- `worker`: worker profiles, emergency contacts, certifications, pay rates, active/inactive status.
- `workorder`: work order aggregate, task list, status state machine, assignment, approval.
- `schedule`: job calendars, dispatch views, worker day plans, rescheduling.
- `fieldwork`: clock-in/out, travel, arrival, work sessions, breaks, completion evidence.
- `document`: Cloudflare R2 object metadata, signed upload/download URLs, report artifacts.
- `notification`: email templates, email sending, notification log, future push/SMS adapter.
- `finance`: invoices, invoice lines, tax calculations, payment status.
- `payroll`: approved hours, payroll periods, payroll records.
- `inventory`: categories, products/materials, quantity on hand, reorder levels, materials usage, purchase order matching.
- `asset`: vehicles, tools, equipment, identifiers/serial numbers, active status, and worker assignment.
- `analytics`: audit logs, dashboards, operational metrics, financial summaries.
- `superadmin`: cross-tenant platform management, tenant suspension, global settings, platform metrics.
- `integration`: external providers such as SES, Cloudflare R2, payment gateways, accounting systems, SMS, maps.

## Security Reuse Plan

Reuse the authentication, authorization, and security structure from `/Applications/SourceCode/adh-catalog/backend`, but adapt names and domain rules:

- Copy/adapt the concepts from `auth/internal/config/SecurityConfig.java`: multiple `SecurityFilterChain`s, stateless sessions, CORS, method security, public endpoint allow-list, admin endpoint role restrictions, and hardened headers.
- Copy/adapt the JWT filter/provider pattern from `auth/internal/security/JwtAuthenticationFilter.java` and `TokenProvider.java`.
- Copy/adapt token blacklist/session revocation, password encoding, auth audit, entry point, access denied handler, and common exception response handling.
- Copy/adapt `TenantContext`, but make tenant resolution explicit for Lorne: JWT claim first, then trusted `X-Tenant-ID` only on allowed bootstrap/public flows.
- Replace catalog roles with Lorne roles: `SUPER_ADMIN`, `TENANT_ADMIN`, `OPERATIONS`, `FINANCE`, `FIELD_WORKER`, `CUSTOMER`.
- Replace catalog permissions with Lorne permissions such as `MANAGE_TENANTS`, `MANAGE_PROPERTIES`, `CREATE_WORK_ORDERS`, `ASSIGN_WORKERS`, `APPROVE_WORK`, `VIEW_FINANCE`, `MANAGE_PAYROLL`, `UPLOAD_JOB_PHOTOS`, `VIEW_CUSTOMER_PORTAL`.
- Avoid duplicated security helpers across modules. Security primitives belong in `lorne-common`; auth workflow belongs in the `auth` module; endpoint authorization belongs at controllers/services through `@PreAuthorize` or security matchers.

Do not copy catalog-specific roles, catalog/PIM assumptions, payment-provider assumptions, or marketing/public catalog endpoint rules into Lorne.

## PostgreSQL Migration Project

Use a top-level `db-migration` project so database change ownership is independent from the application jar. Mirror the `adh-catalog/db-migration` approach: a standalone Flyway runner that can be executed before or alongside deployments, while the Spring Boot app uses `ddl-auto=validate`.

Recommended layout:

```text
db-migration/
├── pom.xml
├── flyway-postgresql.properties.example
└── src/main/resources/db/migration/postgresql/
    ├── V1__extensions_and_schemas.sql
    ├── V2__tenants_users_roles.sql
    ├── V3__audit_outbox_and_security.sql
    ├── V4__customers_and_properties.sql
    ├── V5__workers.sql
    ├── V6__work_orders_and_schedule.sql
    ├── V7__fieldwork_and_photos.sql
    ├── V8__finance_payroll_inventory_assets.sql
    └── R__seed_reference_data.sql
```

Migration principles:

- PostgreSQL is the production database target.
- Keep only PostgreSQL migrations for Lorne unless there is a real second database target.
- Use Maven Flyway commands if copying the `adh-catalog` migration runner style; if the backend standardizes fully on Gradle later, keep this as a separate top-level Gradle project instead of nesting it under `backend/modules`.
- Keep credentials out of committed properties. Commit only examples and read real URLs/passwords from environment variables or deployment secrets.
- Initial migrations create extensions, enum strategy, tenants, users, roles, audit/outbox tables, and shared indexes.
- Domain migrations should stay aligned with Modulith module ownership.
- Every tenant-owned table includes `tenant_id`, `created_at`, `updated_at`, `created_by`, and `updated_by`.
- Every command handler that creates, updates, deletes, approves, rejects, assigns, schedules, uploads, sends, clocks, starts travel, arrives, starts work, records a break, completes work, or changes payment/payroll/customer-visible state must write an append-only audit event in the same transaction where practical.
- Worker audit events must include tenant ID, actor user ID, worker ID, action, resource type, resource ID, previous status when relevant, next status when relevant, timestamp, request source (`worker-app`), IP/user-agent/device metadata, and GPS/photo metadata when captured.
- Tenant user audit events must include tenant ID, actor user ID, role(s), action, resource type, resource ID, before/after summary for changed fields, request source (`tenant-portal`), IP/user-agent, and correlation ID.
- Super Admin audit events must capture platform-level actions across tenants, including tenant creation/suspension, plan changes, impersonation/support access, and settings changes.
- Do not audit raw secrets, passwords, full JWTs, payment card data, or unredacted sensitive free text. Store redacted summaries and object references instead.
- Expose audit search in `admin-portal` for platform actions and in `tenant-portal` for tenant-scoped actions; field workers should not browse audit logs.
- Add indexes that match tenant-scoped queries from day one, for example `(tenant_id, status)`, `(tenant_id, scheduled_start)`, `(tenant_id, property_id)`.
- Enforce referential integrity with foreign keys unless a boundary intentionally requires event-based decoupling.
- Use UUID primary keys for production tables.
- Keep CSV demo data as seed inputs only after normalizing IDs and tenant ownership.
- Application config must use `spring.jpa.hibernate.ddl-auto=validate`.
- CI should run migration validation against a disposable PostgreSQL Testcontainers database.

If using Spring Modulith's module-aware Flyway support later, keep module migration folders aligned with Modulith module names. That allows module-scoped migrations and module tests without losing the separate migration project discipline.

## EC2 / Caddy Deployment Plan

Copy the deployment shape from `/Applications/SourceCode/adh-catalog/deploy/ec2`, but replace all CatalogMint names, domains, service names, and environment variables with Lorne-specific ones.

Recommended services:

- `edge`: Caddy container exposing only ports `80` and `443`.
- `lorne-modulith`: Spring Boot backend on the private Docker network, listening on `8091`.
- `tenant-portal`: Angular tenant app container, private to Caddy.
- `admin-portal`: Angular platform-admin app container, private to Caddy.
- `postgres`: PostgreSQL, private network only unless using managed RDS.
- `redis`: private cache/session/rate-limit service if needed.
- `db-migration`: one-shot migration service or CI/CD job that runs before the app is promoted.

Caddy routing:

- `{$APP_DOMAIN}` routes tenant-portal static/app traffic and proxies `/api/v1/*` to `lorne-modulith:8091`.
- `{$ADMIN_DOMAIN}` routes admin-portal static/app traffic and proxies `/api/v1/*` to `lorne-modulith:8091`.
- Optional `{$WS_DOMAIN}` can route WebSocket/SSE traffic later if live operations dashboards need a separate host.
- Optional `{$LANDING_DOMAIN}` can route a future marketing site; it is not required for the MVP application.

Caddyfile standards:

- Use reusable security header snippets.
- Enable `gzip` and `zstd` response encoding.
- Add HSTS only for production hostnames.
- Keep backend/admin private services off host ports.
- Use local, preview, and production Caddyfile variants where necessary.
- Include a stack helper script similar to `run-stack.sh` that fails if private services accidentally expose host ports.
- Keep `SPRING_FLYWAY_ENABLED=false` in the app container when migrations are owned by the top-level migration job.

## MVP Recommendation

Build Phase 1 around the smallest production workflow that proves the platform:

- Secure login with tenant and role context.
- Tenant management for Super Admin.
- Tenant Admin setup for company, workers, customers, properties, service catalog, and basic settings.
- Operations work order flow: create, schedule, assign, monitor, approve.
- Field worker mobile flow: today's jobs, travel, arrival, work start, break, photo upload, completion, and notes.
- Photo storage and retrieval.
- Completion report generation and customer email.
- Basic invoice generation from approved work.
- Audit logging for every tenant and worker action that changes business state, plus sensitive reads.

Defer to Phase 2:

- Payroll automation beyond basic approved-hour summary.
- Advanced dashboards and profitability analytics.
- Inventory and vehicles beyond simple CRUD.
- Push/SMS notifications.
- Customer self-service quote requests.
- Payment processing and accounting integrations.

## First Backend Data Model

Start with these production tables:

- tenants
- users
- roles
- user_tenant_roles
- customers
- properties
- property_access_instructions
- service_categories
- service_types
- workers
- worker_emergency_contacts
- worker_certifications
- work_orders
- work_order_tasks
- work_order_assignments
- work_order_time_entries
- work_order_breaks
- work_order_photos
- work_order_materials
- inventory_categories
- inventory_items
- work_order_materials
- assets
- invoices
- invoice_lines
- payments
- payroll_periods
- payroll_records
- notifications
- email_templates
- audit_logs
- documents

Every tenant-owned table should include:

- `tenant_id`
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`

Prefer aggregates rather than anemic table-by-table services:

- Work order aggregate: work order, tasks, assignments, status transitions, approvals, materials, and completion evidence.
- Field work aggregate: shift/session, travel segment, work segment, break segment, GPS sample, and worker completion decision.
- Finance aggregate: invoice, invoice line, tax line, payment allocation.
- Worker aggregate: worker profile, certification, emergency contact, documents.
- Property aggregate: property, service plan, access instruction, property document/photo metadata.

## API Areas To Build First

- Auth/session: current user, tenant context, role permissions.
- Tenants: create, suspend, plan/status updates, metrics.
- Customers and properties: CRUD, property detail, property history.
- Workers: CRUD, status, profile, certifications, emergency contacts.
- Work orders: create against property, attach service, assign worker(s), schedule, update, status transitions, task completion, materials usage, and completion evidence.
- Field time tracking: clock-in, travel start/end, work start/end, breaks, completion.
- Photos/documents: Cloudflare R2 signed upload URL, metadata save, secure retrieval.
- Approvals: pending queue, approve/reject, supervisor notes.
- Notifications: send completion email, log sent email, render report.
- Finance: create invoice from approved work, list invoices, mark payments.
- Audit logs: append-only event records.
- Audit writer: shared Modulith-safe service/facade used by tenant, worker, fieldwork, workorder, finance, notification, and superadmin modules.

## Key Implementation Risks

- Tenant isolation must be designed before real data entry starts. Retrofitting tenant boundaries later is expensive and risky.
- Work order status transitions need a strict state machine so finance, payroll, notifications, and customer history stay consistent.
- Photo upload should not pass large files through the API server; use Cloudflare R2 presigned PUT uploads from the browser/app and persist metadata in the API.
- Field worker flows need offline/poor-network tolerance eventually. For MVP, at least preserve in-progress state locally and retry uploads.
- Field worker UX must avoid manual data entry during normal job execution. If workers need to type repeatedly in the field, adoption and data quality will suffer.
- Worker-app hardening should proceed in small vertical slices: calendar/search/filters first, then field action draft persistence, then retryable photo/material/tool submissions, then GPS/device metadata and supervisor-visible execution timeline.
- Demo role selection in the current login screen must be replaced with real auth and authorization guards.
- Mock data and CSV seeds need to become real database migrations plus seed scripts.
- Customer emails, invoice generation, and payroll calculations should be idempotent so retries do not duplicate money or messages.
- Sharing entities across modules can break Modulith boundaries. Use facades, ports, events, or DTO named interfaces instead.
- A migration project reduces schema drift, but only if the application never uses automatic schema updates.

## Suggested Build Order

1. Scaffold the repository shell in the `adh-catalog` style: `backend/`, `db-migration/`, `frontend/tenant-portal`, `frontend/admin-portal`, `frontend/packages`, and `deploy/ec2`.
2. Set Spring Boot to `4.1.0` and Spring Modulith to the compatible current line. Add Spring Web, Security, Data JPA, Validation, Actuator, Flyway, PostgreSQL, Spring Modulith core/JPA/test, Springdoc, JJWT, Testcontainers, and the AWS S3 SDK for Cloudflare R2 compatibility.
3. Add root application config with local profile, PostgreSQL datasource, Flyway disabled in the app by default if migrations are run by the migration project, JPA validate mode, CORS, JWT, Cloudflare R2, mail, and actuator settings.
4. Port/adapt common security, tenant context, exception, response, and auditing support from `adh-common` and `adh-modulith/auth`.
5. Add initial Modulith packages and `package-info.java` boundaries for `auth`, `tenant`, `customer`, `property`, `worker`, `workorder`, `fieldwork`, `notification`, `finance`, `analytics`, `superadmin`, and `shared`.
6. Add `ApplicationModules.verify()` test and keep it passing from the first backend commit.
7. Create the top-level `db-migration` Flyway project and the first PostgreSQL migrations for tenants, users, roles, customers, properties, workers, work orders, audit logs, and outbox/events.
8. Scaffold `frontend/tenant-portal`, `frontend/admin-portal`, and `frontend/worker-app` with Angular, PrimeNG, Tailwind, PrimeIcons, standalone components, lazy routes, guards, interceptors, and shared contract package wiring.
9. Scaffold `deploy/ec2` with Caddy, Docker Compose, local/prod Caddyfiles, environment examples, public routes for tenant/admin/worker apps, and private-port safety checks.
10. Implement auth/session APIs and replace the prototype demo login with real JWT session handling, tenant context, route guards, and role/permission menus in all Angular apps.
11. Implement the shared audit writer and require all tenant, worker, and superadmin command endpoints to record append-only audit entries.
12. Implement property-owner, property, service-catalog, property-service assignment, inventory, equipment/assets, tenant user management, worker onboarding, customer, and work order CRUD APIs and replace mock frontend repositories module by module.
13. Add server-side search, filtering, and pagination for owners, properties, service types, workers, inventory, and assets before production-scale tenant imports.
14. Implement the work order state machine, field worker time tracking, photo upload metadata, approvals, and owner completion email flow. Owner completion notification should fire after operations approves worker-submitted work, not before review, and it should be logged separately from invoice delivery.
14.1. Allow tenant admin and operations users to add work-order review evidence after field submission, including before/after/issue photos and purchase receipts, using the shared R2 document flow and work-order audit trail.
15. Build the dedicated `worker-app` mobile/tablet flow as tap-first screens with prefilled data, large actions, photo capture, offline drafts, and minimal typing.
15.1. Strengthen worker execution usability with searchable assigned-job queues, status/timing filters, Today navigation, route links, disabled-state guidance, validation messages, and locally saved action drafts.
15.1.1. Keep worker app navigation simple: `/today` is the assigned-job list/calendar, `/loadout` is the worker's daily tools/equipment/materials checklist, and `/jobs/:id` is the work-order execution workspace with timing, checklist, materials/purchases, before/after/issue photos, tools/equipment return, notes, and completion actions.
15.1.2. Add worker shift clock-in/clock-out after login as a fieldwork session API, then replace the temporary local shift clock state with backend-backed open-session status and audit events.
15.1.3. Add daily loadout and tool return workflow: aggregate assigned work-order tools/equipment/materials by worker/date, require clock-in for checkout/return/issue actions, update the work-order tool release state on return, and audit every loadout tap.
15.2. Add retry queues for offline/poor-network worker actions and R2 photo uploads, including visible pending/synced states and audit correlation IDs.
15.3. Add GPS/time/device metadata capture for travel, arrival, work start, pauses, completion, photo evidence, material usage, and tool return actions.
16. Add invoice generation, invoice PDF download, invoice owner email delivery, basic payment status tracking, payroll validation, and operational dashboards from real queries. Email templates for completion notices and invoices should remain separate tenant-admin settings.
16.1. Build the payment lifecycle after invoice generation: record payment amount/method/date/reference, keep payment history against each invoice, auto-mark invoices as partially paid or paid, auto-mark the work order paid when fully settled, and audit every payment event.
16.2. Dashboard and reports should expose real tenant operating data: open work, pending review, ready-to-invoice work orders, today schedule, worker load, receivables, overdue invoices, service demand, portfolio coverage, low inventory, and unassigned tools/equipment.
16.3. Reports should be filterable and printable by worker or property, summarizing matching work orders, schedule, status, assigned workers, linked invoices, and billed totals.
16.4. Tenant settings should own company profile, invoice branding, theme colors, payment terms, footer copy, and email sender configuration so invoice PDFs and owner emails can be tenant-branded.
16.5. Email templates and email sender configuration are separate concerns: templates control copy, tenant settings control from/reply-to/SMTP identity, and delivery logs/audit prove what was sent or recorded.
17. Harden with integration tests, module tests, security tests, migration validation, audit completeness tests, and idempotency checks for notifications/invoices/payroll.

## Open Product Questions

- Should the first product target one vertical, such as pool cleaning, or stay generic for all property maintenance companies?
- Should the frontend and backend live in the same repository long-term, or should the Spring backend become its own repository after initial scaffolding?
- Which country/province tax rules are required at launch? The BRD examples use Ontario HST at 13%.
- Are field workers employees, contractors, or both?
- Does the platform need route optimization in Phase 1, or only navigation links?
- Should customers have login access in MVP, or only receive email reports and invoices?
- What subscription plans and feature gates should Super Admin manage?
- What audit events are legally or operationally mandatory?

## Immediate Next Step

The strongest next product slice is offline reliability for the worker app: queue field actions, notes, photo metadata, loadout actions, and R2 upload completion records locally when connectivity is weak, then retry with visible pending/synced states and audit correlation IDs.

For tenant administration, the next finance/communication slice is to harden tenant-branded invoices and outbound mail settings: professional invoice PDF layout, tenant SMTP sender configuration, sender identity, theme colors, payment terms, and audited delivery results.
