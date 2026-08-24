ALTER TABLE work_order_route_stops
    ADD COLUMN visible_to_worker boolean NOT NULL DEFAULT true;
