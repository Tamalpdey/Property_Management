# UTC Storage and Tenant Timezone

Tenant administrators configure **Settings > Settings > Regional settings > Timezone**. This updates the existing `tenants.timezone` field; it does not add a second timezone setting. The super admin tenant editor uses the same field.

Timestamps remain UTC instants in PostgreSQL `timestamptz` columns and API `Instant` values. The backend already sets Hibernate's JDBC timezone to UTC. Do not rewrite stored timestamps when changing the display timezone.

Tenant and worker timestamp displays use the configured timezone, including daylight-saving offsets at the timestamp's date. Quote history, site visit notes, public capture links, and day ticket timestamps use the same convention. Public quote/capture responses expose the tenant timezone without exposing private settings. Super admin platform pages retain their existing operator-local display because they span multiple tenants.

Quote numbers use the tenant-local issue date and the existing per-tenant daily sequence. For example, `2026-10-15T01:30:00Z` is October 14 in Toronto, so a new quote uses `261014-0001` (`YYMMDD-NNNN`). An explicitly supplied issue date is retained. Existing quote numbers, including the former `Q-YYYYMMDD-NNNN` format, are never renumbered when timezone or numbering format changes.

Issue dates and validity dates are SQL `date` values, not timestamps. They remain calendar dates without timezone conversion. A quote's validity ends at the next midnight in the tenant timezone; UTC midnight must not expire it early.

No database migration is needed for this timezone change. Rebuild/deploy the backend, tenant portal, and worker app together. Existing stored timestamp data is retained.

Verification covers UTC midnight, Toronto summer/winter offsets, daylight-saving transitions, fractional-hour offsets, calendar-only values, timezone validation, older settings clients omitting the new field, and PostgreSQL timestamp round trips under different session timezones.
