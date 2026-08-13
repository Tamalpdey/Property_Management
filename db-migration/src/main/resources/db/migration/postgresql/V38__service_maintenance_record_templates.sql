ALTER TABLE service_types
    ADD COLUMN IF NOT EXISTS maintenance_record_template jsonb NOT NULL DEFAULT '{"enabled":false,"title":"Maintenance record","callTypes":[],"checks":[],"measurements":[],"chemicals":[],"deliveries":[],"noteLabel":"Client note"}'::jsonb;

UPDATE service_types
SET maintenance_record_template = '{
  "enabled": true,
  "title": "Pool maintenance record",
  "callTypes": [
    { "key": "maintenance", "label": "Maintenance", "defaultSelected": true, "match": ["maintenance", "pool", "service"] },
    { "key": "chemical", "label": "Chemical check", "match": ["chemical", "chlorine"] },
    { "key": "other", "label": "Other" }
  ],
  "checks": [
    { "key": "pool-vacuumed", "label": "Pool Vacuumed", "match": ["vacuum"] },
    { "key": "waterline-cleaned", "label": "Waterline Cleaned", "match": ["waterline"] },
    { "key": "pool-skimmed", "label": "Pool Skimmed", "match": ["skim"] },
    { "key": "pool-brushed", "label": "Pool Brushed", "match": ["brush"] },
    { "key": "pump-basket-emptied", "label": "Pump Basket Emptied", "match": ["pump", "basket"] },
    { "key": "skimmer-emptied", "label": "Skimmer Emptied", "match": ["skimmer"] },
    { "key": "filter-backwashed", "label": "Filter Backwashed", "match": ["backwash", "filter"] },
    { "key": "water-added", "label": "Water Added", "match": ["water"] },
    { "key": "pool-vac-system-cleaned", "label": "Pool Vac System Cleaned", "match": ["vac", "clean"] },
    { "key": "pool-vac-system-tested", "label": "Pool Vac System Tested", "match": ["vac", "test"] }
  ],
  "measurements": [
    { "key": "pool-filter-pressure", "label": "Pool Filter Pressure", "unit": "psi" },
    { "key": "pool-temperature", "label": "Pool Temperature", "unit": "F/C" },
    { "key": "whirlpool-filter-pressure", "label": "Whirlpool Filter Pressure", "unit": "psi" },
    { "key": "whirlpool-temperature", "label": "Whirlpool Temperature", "unit": "F/C" }
  ],
  "chemicals": [
    { "key": "cl-br", "label": "Cl/Br", "unit": "ppm" },
    { "key": "ph", "label": "pH", "unit": "ppm" },
    { "key": "ta", "label": "TA", "unit": "ppm" },
    { "key": "cal", "label": "CAL", "unit": "ppm" },
    { "key": "stab", "label": "STAB", "unit": "ppm" },
    { "key": "salt", "label": "SALT", "unit": "ppm" },
    { "key": "rate", "label": "RATE", "unit": "%" }
  ],
  "deliveries": [
    { "key": "liquid-chlorine", "label": "Liquid Chlorine", "inventoryKeywords": ["liquid chlorine", "chlorine"] },
    { "key": "chlorine-tablets", "label": "Chlorine Tablets", "inventoryKeywords": ["chlorine tablet", "chlorine tablets"] },
    { "key": "granular-shock", "label": "Granular Shock", "inventoryKeywords": ["granular shock", "shock"] },
    { "key": "lithium-shock", "label": "Lithium Shock", "inventoryKeywords": ["lithium shock"] },
    { "key": "buffer", "label": "Buffer", "inventoryKeywords": ["buffer"] },
    { "key": "ph-increaser", "label": "pH Increaser", "inventoryKeywords": ["ph increaser"] },
    { "key": "msr-sequerian-agent", "label": "MSR Sequerian Agent", "inventoryKeywords": ["msr", "sequerian"] },
    { "key": "algaecide", "label": "4LG Algaecide", "inventoryKeywords": ["algaecide"] },
    { "key": "muriatic-acid", "label": "Muriatic Acid", "inventoryKeywords": ["muriatic acid"] },
    { "key": "cyanuric-acid", "label": "Cyanuric Acid", "inventoryKeywords": ["cyanuric acid"] },
    { "key": "pool-salt", "label": "Pool Salt", "inventoryKeywords": ["pool salt", "salt"] }
  ],
  "noteLabel": "Client note"
}'::jsonb,
    updated_at = now()
WHERE (lower(name) LIKE '%pool%' OR lower(name) LIKE '%chemical%')
  AND COALESCE(maintenance_record_template ->> 'enabled', 'false') = 'false';
