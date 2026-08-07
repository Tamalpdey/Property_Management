\set ON_ERROR_STOP on

\if :{?tenant_id}
\else
\set tenant_id '10000000-0000-0000-0000-000000000001'
\endif

BEGIN;

WITH target_tenant AS (
    SELECT id
    FROM tenants
    WHERE id = :'tenant_id'::uuid
),
incoming_categories(name) AS (
    VALUES
        ('Plumbing Parts'),
        ('Pool Chemicals'),
        ('Pool Supplies'),
        ('Landscaping Supplies'),
        ('Hardware'),
        ('Cleaning Supplies'),
        ('Safety Supplies')
)
INSERT INTO inventory_categories (tenant_id, name)
SELECT target_tenant.id, incoming_categories.name
FROM target_tenant
CROSS JOIN incoming_categories
ON CONFLICT (tenant_id, name) DO UPDATE SET
    updated_at = now();

WITH target_tenant AS (
    SELECT id
    FROM tenants
    WHERE id = :'tenant_id'::uuid
),
incoming_items(category_name, name, unit, quantity_on_hand, reorder_level, storage_location) AS (
    VALUES
        ('Plumbing Parts', 'PEX tubing roll 1/2 in', 'roll', 14.00, 4.00, 'Warehouse A - Plumbing'),
        ('Plumbing Parts', 'PVC coupling 1/2 in', 'each', 120.00, 30.00, 'Warehouse A - Plumbing'),
        ('Plumbing Parts', 'Toilet fill valve kit', 'each', 32.00, 8.00, 'Warehouse A - Plumbing'),
        ('Plumbing Parts', 'Faucet cartridge mixed pack', 'kit', 18.00, 5.00, 'Warehouse A - Plumbing'),
        ('Plumbing Parts', 'Pipe sealant tape', 'roll', 80.00, 20.00, 'Warehouse A - Plumbing'),
        ('Plumbing Parts', 'Supply line braided 20 in', 'each', 44.00, 12.00, 'Warehouse A - Plumbing'),
        ('Pool Chemicals', 'Chlorine tablets 3 in', 'bucket', 22.00, 6.00, 'Chemical Locker'),
        ('Pool Chemicals', 'pH increaser', 'bag', 16.00, 5.00, 'Chemical Locker'),
        ('Pool Chemicals', 'Alkalinity increaser', 'bag', 14.00, 5.00, 'Chemical Locker'),
        ('Pool Chemicals', 'Algaecide quart', 'bottle', 28.00, 8.00, 'Chemical Locker'),
        ('Pool Chemicals', 'Pool shock 1 lb', 'bag', 65.00, 20.00, 'Chemical Locker'),
        ('Pool Supplies', 'Water test strips', 'bottle', 36.00, 10.00, 'Pool Bay'),
        ('Pool Supplies', 'Skimmer basket universal', 'each', 20.00, 5.00, 'Pool Bay'),
        ('Pool Supplies', 'Skimmer socks', 'pack', 40.00, 10.00, 'Pool Bay'),
        ('Landscaping Supplies', 'Grass seed repair mix', 'bag', 18.00, 6.00, 'Warehouse B - Grounds'),
        ('Landscaping Supplies', 'Mulch natural brown', 'bag', 75.00, 20.00, 'Warehouse B - Grounds'),
        ('Landscaping Supplies', 'Fertilizer slow release', 'bag', 24.00, 8.00, 'Warehouse B - Grounds'),
        ('Landscaping Supplies', 'Sprinkler head 4 in pop-up', 'each', 48.00, 12.00, 'Warehouse B - Irrigation'),
        ('Hardware', 'Deck screw exterior 2 in', 'box', 26.00, 8.00, 'Warehouse A - Hardware'),
        ('Hardware', 'Wall anchors assorted', 'kit', 34.00, 10.00, 'Warehouse A - Hardware'),
        ('Cleaning Supplies', 'Contractor trash bags', 'box', 42.00, 12.00, 'Warehouse C - Cleaning'),
        ('Cleaning Supplies', 'Multi-surface cleaner concentrate', 'gallon', 18.00, 6.00, 'Warehouse C - Cleaning'),
        ('Safety Supplies', 'Nitrile gloves', 'box', 55.00, 15.00, 'Safety Cage'),
        ('Safety Supplies', 'Safety glasses clear', 'each', 40.00, 10.00, 'Safety Cage'),
        ('Safety Supplies', 'Disposable respirator mask', 'box', 22.00, 8.00, 'Safety Cage')
),
updated AS (
    UPDATE inventory_items item
    SET category_id = category.id,
        unit = incoming.unit,
        quantity_on_hand = incoming.quantity_on_hand,
        reorder_level = incoming.reorder_level,
        storage_location = incoming.storage_location,
        updated_at = now()
    FROM target_tenant tenant
    JOIN incoming_items incoming ON true
    JOIN inventory_categories category
      ON category.tenant_id = tenant.id
     AND category.name = incoming.category_name
    WHERE item.tenant_id = tenant.id
      AND lower(item.name) = lower(incoming.name)
    RETURNING item.id
)
INSERT INTO inventory_items (tenant_id, category_id, name, unit, quantity_on_hand, reorder_level, storage_location)
SELECT tenant.id, category.id, incoming.name, incoming.unit, incoming.quantity_on_hand, incoming.reorder_level, incoming.storage_location
FROM target_tenant tenant
JOIN incoming_items incoming ON true
JOIN inventory_categories category
  ON category.tenant_id = tenant.id
 AND category.name = incoming.category_name
WHERE NOT EXISTS (
    SELECT 1
    FROM inventory_items item
    WHERE item.tenant_id = tenant.id
      AND lower(item.name) = lower(incoming.name)
);

WITH target_tenant AS (
    SELECT id
    FROM tenants
    WHERE id = :'tenant_id'::uuid
),
incoming_assets(asset_type, name, identifier, quantity_on_hand, storage_location, assigned_employee_number) AS (
    VALUES
        ('TOOL', 'Pipe wrench set', 'TOOL-PLUMB-001', 4.00, 'Tool Cage - Plumbing', NULL),
        ('TOOL', 'Drain snake 25 ft', 'TOOL-PLUMB-002', 3.00, 'Tool Cage - Plumbing', NULL),
        ('TOOL', 'Cordless drill kit', 'TOOL-GEN-001', 6.00, 'Tool Cage - General', NULL),
        ('TOOL', 'Voltage tester', 'TOOL-GEN-002', 5.00, 'Tool Cage - General', NULL),
        ('TOOL', 'Pool telescopic pole', 'TOOL-POOL-001', 8.00, 'Pool Bay', NULL),
        ('TOOL', 'Pool vacuum head', 'TOOL-POOL-002', 6.00, 'Pool Bay', NULL),
        ('TOOL', 'Pool water test kit', 'TOOL-POOL-003', 5.00, 'Pool Bay', NULL),
        ('EQUIPMENT', 'Wet dry vacuum 12 gal', 'EQ-GEN-001', 3.00, 'Equipment Bay', NULL),
        ('EQUIPMENT', 'Pressure washer 3200 PSI', 'EQ-GEN-002', 2.00, 'Equipment Bay', NULL),
        ('EQUIPMENT', 'Extension ladder 8 ft', 'EQ-GEN-003', 4.00, 'Equipment Bay', NULL),
        ('EQUIPMENT', 'Push lawn mower', 'EQ-GROUND-001', 3.00, 'Grounds Shed', NULL),
        ('EQUIPMENT', 'String trimmer', 'EQ-GROUND-002', 4.00, 'Grounds Shed', NULL),
        ('EQUIPMENT', 'Backpack leaf blower', 'EQ-GROUND-003', 3.00, 'Grounds Shed', NULL),
        ('SAFETY', 'Traffic cone set', 'SAFE-001', 12.00, 'Safety Cage', NULL),
        ('SAFETY', 'High visibility vest set', 'SAFE-002', 20.00, 'Safety Cage', NULL),
        ('VEHICLE', 'Service van 01', 'VAN-001', 1.00, 'Main Lot', 'FW-001')
),
resolved_assets AS (
    SELECT tenant.id AS tenant_id,
           incoming.asset_type,
           incoming.name,
           incoming.identifier,
           incoming.quantity_on_hand,
           incoming.storage_location,
           worker.id AS assigned_worker_id
    FROM target_tenant tenant
    JOIN incoming_assets incoming ON true
    LEFT JOIN workers worker
      ON worker.tenant_id = tenant.id
     AND worker.employee_number = incoming.assigned_employee_number
),
updated AS (
    UPDATE assets asset
    SET identifier = resolved.identifier,
        quantity_on_hand = resolved.quantity_on_hand,
        storage_location = resolved.storage_location,
        assigned_worker_id = resolved.assigned_worker_id,
        active = true,
        updated_at = now()
    FROM resolved_assets resolved
    WHERE asset.tenant_id = resolved.tenant_id
      AND lower(asset.asset_type) = lower(resolved.asset_type)
      AND lower(asset.name) = lower(resolved.name)
    RETURNING asset.id
)
INSERT INTO assets (tenant_id, asset_type, name, identifier, quantity_on_hand, storage_location, assigned_worker_id, active)
SELECT resolved.tenant_id,
       resolved.asset_type,
       resolved.name,
       resolved.identifier,
       resolved.quantity_on_hand,
       resolved.storage_location,
       resolved.assigned_worker_id,
       true
FROM resolved_assets resolved
WHERE NOT EXISTS (
    SELECT 1
    FROM assets asset
    WHERE asset.tenant_id = resolved.tenant_id
      AND lower(asset.asset_type) = lower(resolved.asset_type)
      AND lower(asset.name) = lower(resolved.name)
);

COMMIT;

SELECT
    (SELECT count(*) FROM inventory_categories WHERE tenant_id = :'tenant_id'::uuid) AS inventory_categories,
    (SELECT count(*) FROM inventory_items WHERE tenant_id = :'tenant_id'::uuid) AS inventory_items,
    (SELECT count(*) FROM assets WHERE tenant_id = :'tenant_id'::uuid) AS tools_equipment_assets;
