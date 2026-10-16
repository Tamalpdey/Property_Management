-- Earlier V76 deployments predate ad-hoc clients and properties.
ALTER TABLE quotes
    ADD COLUMN IF NOT EXISTS adhoc_customer_name text,
    ADD COLUMN IF NOT EXISTS adhoc_customer_email citext,
    ADD COLUMN IF NOT EXISTS adhoc_customer_phone text,
    ADD COLUMN IF NOT EXISTS adhoc_property_name text,
    ADD COLUMN IF NOT EXISTS adhoc_property_address text;

ALTER TABLE quotes ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE quotes
    ADD COLUMN access_password_hash text,
    ADD COLUMN access_failed_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN access_locked_until timestamptz,
    ADD COLUMN published_details jsonb;

UPDATE quotes q SET published_details = jsonb_build_object(
    'customerName', coalesce(c.display_name, q.adhoc_customer_name),
    'customerEmail', coalesce(c.email::text, q.adhoc_customer_email::text),
    'customerPhone', coalesce(c.phone, q.adhoc_customer_phone),
    'propertyName', coalesce(p.name, q.adhoc_property_name),
    'propertyAddress', coalesce(nullif(concat_ws(', ', p.address_line1, nullif(p.address_line2, ''), p.city, p.province_code, p.postal_code), ''), q.adhoc_property_address),
    'serviceName', st.name
)
FROM quotes source
LEFT JOIN customers c ON c.id = source.customer_id AND c.tenant_id = source.tenant_id
LEFT JOIN properties p ON p.id = source.property_id AND p.tenant_id = source.tenant_id
LEFT JOIN service_types st ON st.id = source.service_type_id AND st.tenant_id = source.tenant_id
WHERE q.id = source.id AND q.status IN ('SENT', 'VIEWED', 'APPROVED', 'CONVERTED');

-- Approval freezes the accepted document; only work-order conversion bookkeeping may change.
CREATE FUNCTION protect_approved_quote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status IN ('APPROVED', 'CONVERTED') THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'An approved quote cannot be deleted';
        END IF;
        IF NEW.status NOT IN ('APPROVED', 'CONVERTED')
           OR (OLD.status = 'CONVERTED' AND NEW.status <> 'CONVERTED')
           OR (to_jsonb(NEW) - ARRAY['status', 'converted_work_order_id', 'converted_at', 'updated_by', 'updated_at', 'access_failed_attempts', 'access_locked_until'])
              IS DISTINCT FROM
              (to_jsonb(OLD) - ARRAY['status', 'converted_work_order_id', 'converted_at', 'updated_by', 'updated_at', 'access_failed_attempts', 'access_locked_until']) THEN
            RAISE EXCEPTION 'An approved quote is locked';
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER quotes_approval_lock BEFORE UPDATE OR DELETE ON quotes
    FOR EACH ROW EXECUTE FUNCTION protect_approved_quote();

CREATE FUNCTION protect_approved_quote_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        SELECT status INTO parent_status FROM quotes WHERE id = OLD.quote_id FOR UPDATE;
        IF parent_status IN ('APPROVED', 'CONVERTED') THEN
            RAISE EXCEPTION 'Approved quote lines are locked';
        END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        SELECT status INTO parent_status FROM quotes WHERE id = NEW.quote_id FOR UPDATE;
        IF parent_status IN ('APPROVED', 'CONVERTED') THEN
            RAISE EXCEPTION 'Approved quote lines are locked';
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER quote_lines_approval_lock BEFORE INSERT OR UPDATE OR DELETE ON quote_lines
    FOR EACH ROW EXECUTE FUNCTION protect_approved_quote_lines();
