ALTER TABLE service_categories
    ADD COLUMN IF NOT EXISTS maintenance_record_template jsonb NOT NULL DEFAULT '{
      "enabled": false,
      "title": "Service record",
      "callTypes": [],
      "checks": [],
      "measurements": [],
      "chemicals": [],
      "deliveries": [],
      "noteLabel": "Client note"
    }'::jsonb;

-- Preserve the most complete enabled service template in each category. From this
-- migration forward, the category template is the source of truth for every
-- service in that category.
WITH ranked_templates AS (
    SELECT st.category_id,
           st.maintenance_record_template,
           row_number() OVER (
               PARTITION BY st.category_id
               ORDER BY
                   jsonb_array_length(COALESCE(st.maintenance_record_template -> 'checks', '[]'::jsonb))
                   + jsonb_array_length(COALESCE(st.maintenance_record_template -> 'measurements', '[]'::jsonb))
                   + jsonb_array_length(COALESCE(st.maintenance_record_template -> 'chemicals', '[]'::jsonb))
                   + jsonb_array_length(COALESCE(st.maintenance_record_template -> 'deliveries', '[]'::jsonb)) DESC,
                   st.updated_at DESC,
                   st.id
           ) AS template_rank
    FROM service_types st
    WHERE st.category_id IS NOT NULL
      AND COALESCE(st.maintenance_record_template ->> 'enabled', 'false') = 'true'
)
UPDATE service_categories sc
SET maintenance_record_template = ranked.maintenance_record_template,
    updated_at = now()
FROM ranked_templates ranked
WHERE ranked.category_id = sc.id
  AND ranked.template_rank = 1;

