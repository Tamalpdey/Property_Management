ALTER TABLE work_order_route_stops
    DROP CONSTRAINT IF EXISTS ck_work_order_route_stops_type;

ALTER TABLE work_order_route_stops
    ADD CONSTRAINT ck_work_order_route_stops_type
        CHECK (stop_type IN ('PICKUP', 'DELIVERY', 'RETURN', 'KEYS', 'SUPPLIER', 'WAREHOUSE', 'OWNER', 'OTHER'));
