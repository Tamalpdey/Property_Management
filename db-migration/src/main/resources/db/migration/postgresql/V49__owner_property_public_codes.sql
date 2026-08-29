ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS owner_code varchar(24);

WITH owner_codes AS (
    SELECT id,
           tenant_id,
           'OWN-' || upper(substr(replace(id::text, '-', ''), 1, 5) || right(replace(id::text, '-', ''), 5)) AS base_code
    FROM customers
),
deduplicated_owner_codes AS (
    SELECT id,
           base_code,
           row_number() OVER (PARTITION BY tenant_id, base_code ORDER BY id) AS duplicate_number
    FROM owner_codes
),
final_owner_codes AS (
    SELECT id,
           CASE
               WHEN duplicate_number = 1 THEN base_code
               ELSE left(base_code, greatest(1, 23 - length(duplicate_number::text))) || '-' || duplicate_number
           END AS public_code
    FROM deduplicated_owner_codes
)
UPDATE customers c
SET owner_code = d.public_code
FROM final_owner_codes d
WHERE c.id = d.id
  AND c.owner_code IS DISTINCT FROM d.public_code;

ALTER TABLE customers
    ALTER COLUMN owner_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_tenant_owner_code
    ON customers (tenant_id, owner_code);

ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS property_code varchar(24);

WITH property_codes AS (
    SELECT id,
           tenant_id,
           'PRP-' || upper(substr(replace(id::text, '-', ''), 1, 5) || right(replace(id::text, '-', ''), 5)) AS base_code
    FROM properties
),
deduplicated_property_codes AS (
    SELECT id,
           base_code,
           row_number() OVER (PARTITION BY tenant_id, base_code ORDER BY id) AS duplicate_number
    FROM property_codes
),
final_property_codes AS (
    SELECT id,
           CASE
               WHEN duplicate_number = 1 THEN base_code
               ELSE left(base_code, greatest(1, 23 - length(duplicate_number::text))) || '-' || duplicate_number
           END AS public_code
    FROM deduplicated_property_codes
)
UPDATE properties p
SET property_code = d.public_code
FROM final_property_codes d
WHERE p.id = d.id
  AND p.property_code IS DISTINCT FROM d.public_code;

ALTER TABLE properties
    ALTER COLUMN property_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_properties_tenant_property_code
    ON properties (tenant_id, property_code);
