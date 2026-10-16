# Quote Templates

Super administrators manage templates under **Quote templates**. Two pricing layouts are supported:

- **Itemized quote**: description, quantity, unit, rate and amount for each line.
- **Total price quote**: one description per line and one overall price before tax. Per-line quantities and prices are not shown in the editor, PDF or shared client view.

Each layout has an editable display name, default client notes and default terms. This is not an arbitrary document-layout designer. Template changes apply to new quotes; saved quotes retain their template name and pricing mode. Tenant users can still edit draft notes and terms.

Use the **Tenant assignments** tab, or **Tenants > tenant > Quote templates**, to assign one or both layouts and select a default. The tenant's Quote module must also be enabled. Existing and newly onboarded tenants initially receive the itemized layout. Existing drafts retain their saved layout even if it is subsequently unassigned; new quotes and template changes require an assigned layout.

The chosen pricing layout applies to client sharing, PDF downloads and email PDF attachments. Approved quotes remain locked, including their pricing layout and amounts. Conversion carries the description lines and approved total into the work-order description.

Configuration and assignment updates are recorded in the platform audit. Only super administrators can configure or assign layouts. Tenant administrators, Operations and Finance can read their own tenant's assigned layouts.

## Deployment

Apply PostgreSQL Flyway migration `V85__quote_pricing_templates.sql`, then deploy the matching backend, super admin portal and tenant portal builds together. The migration creates the template catalog and tenant assignments, adds quote snapshots and assigns the itemized default without changing existing quote prices or approval data.

Times remain stored as UTC instants; the prior timezone setting controls display and quote-number calendar dates. See `tenant-timezones.md`.

New quote numbers use `YYMMDD-NNNN`, for example `261016-0001`, using the tenant's configured calendar date and the existing daily sequence. Existing quote numbers are not renumbered. Both layouts show the company profile address below the logo, owner name/email under **Prepared For**, the property address under **Project**, **Description (Scope of Work)** and a separate **HST** total. The GST/HST registration number is shown when configured in the company profile. Quote address display is independent of invoice header visibility settings.

PDFs use a two-column header with compact **Issued** and **Valid Until** label/value pairs. Internal quote status is not printed. Owner and project information share a row; short client notes sit alongside totals. Terms are the final section, positioned near the footer when short, or flowing across pages when long. Long descriptions and notes continue onto additional pages with repeated table headers where needed. Approval timestamps use the tenant timezone. Company addresses put the unit/address-line-2 before the street, followed by locality/postal-code lines.
