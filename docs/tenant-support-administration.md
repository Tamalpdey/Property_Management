# Tenant Status and Support Administration

## Super Admin Portal

- **Dashboard** shows total tenants, access-enabled and inactive accounts, tenant lifecycle, administrator access risks, last login, and support workload. It does not display financial totals.
- **Tenants** and the dashboard provide **Activate / Deactivate** controls. Each change requires a reason and confirmation.
- **Tenant > Support > Overview** shows active properties, active workers, open/completed work orders, support counts, and latest login for that tenant.
- **Support tickets** provides tenant, status, priority, and text filters, pagination, assignment to an active super admin, status updates, public replies, and private internal notes.

## Tenant Portal

**Administration > Support tickets** is available to Tenant Admin, Operations, and Finance roles. Users can create tickets, read public replies, reply, close a ticket, and reopen a closed/resolved ticket by replying. Tickets are tenant-scoped. Worker and Customer roles cannot access these endpoints.

## Access Semantics

Inactive uses the existing `SUSPENDED` tenant status. It blocks authenticated tenant and worker requests and revokes tenant refresh sessions. Data, assignments, and support history remain intact. Reactivation sets the tenant to `ACTIVE`; previously revoked sessions are not restored, so users must sign in again.

`ACTIVE`, `TRIAL`, and `PAST_DUE` remain access-enabled statuses. `SUSPENDED` and `CANCELLED` are access-disabled. The existing tenant editor still supports the full lifecycle.

Private support notes and access-change reasons are restricted to platform support. Public ticket activity is recorded in tenant audit without private note text. Ticket state updates use version checking and return HTTP 409 when another update has made the submitted version stale; refresh before retrying.

## Deployment

1. Run the normal Flyway migration process, including `V83__tenant_support_tickets.sql` and `V84__tenant_access_audit_indexes.sql` (and any earlier pending migrations).
2. Rebuild and deploy the backend, super admin portal, and tenant portal together through the existing Docker stack workflow. The worker app has no new UI in this change.
3. Verify a Super Admin can open the dashboard and a tenant overview, deactivate/reactivate a test tenant, and manage tickets.
4. Verify a tenant Operations/Admin/Finance user can create and reply to their own tickets and cannot see another tenant's tickets or internal notes.

Ticket attachments, outbound support email notifications, and SLA automation are not included. Communication is currently in-app.

## Verification

Focused PostgreSQL integration and authorization tests cover tenant isolation, private-note visibility, active-agent assignment, status changes, stale updates, administrator protection, session revocation, and operational counts. Browser checks exercise the real Angular apps with synthetic API responses at 320, 390, 768, and 1440 pixels. Production portal builds are also verified; live OVH deployment is a separate step.
