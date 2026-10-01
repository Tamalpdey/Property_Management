DROP INDEX IF EXISTS ux_properties_tenant_property_code;

WITH property_codes AS (
    SELECT id,
           tenant_id,
           'PRP-' || upper(substr(replace(id::text, '-', ''), 1, 8)) AS base_code
    FROM properties
),
deduplicated AS (
    SELECT id,
           base_code,
           row_number() OVER (PARTITION BY tenant_id, base_code ORDER BY id) AS duplicate_number
    FROM property_codes
),
final_codes AS (
    SELECT id,
           CASE
               WHEN duplicate_number = 1 THEN base_code
               ELSE left(base_code, 9) || lpad(duplicate_number::text, 2, '0')
           END AS public_code
    FROM deduplicated
)
UPDATE properties p
SET property_code = codes.public_code,
    updated_at = now()
FROM final_codes codes
WHERE p.id = codes.id
  AND p.property_code IS DISTINCT FROM codes.public_code;

CREATE UNIQUE INDEX ux_properties_tenant_property_code
    ON properties (tenant_id, property_code);
