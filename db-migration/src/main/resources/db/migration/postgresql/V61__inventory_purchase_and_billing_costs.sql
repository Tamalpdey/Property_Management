ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS billing_cost numeric(12, 2);

UPDATE inventory_items
SET billing_cost = unit_cost
WHERE billing_cost IS NULL
  AND unit_cost IS NOT NULL;

ALTER TABLE work_order_materials
    ADD COLUMN IF NOT EXISTS billing_cost numeric(12, 2);

UPDATE work_order_materials wom
SET billing_cost = COALESCE(ii.billing_cost, wom.unit_cost)
FROM inventory_items ii
WHERE ii.id = wom.inventory_item_id
  AND ii.tenant_id = wom.tenant_id
  AND wom.billing_cost IS NULL;

UPDATE work_order_materials
SET billing_cost = unit_cost
WHERE billing_cost IS NULL
  AND unit_cost IS NOT NULL;

