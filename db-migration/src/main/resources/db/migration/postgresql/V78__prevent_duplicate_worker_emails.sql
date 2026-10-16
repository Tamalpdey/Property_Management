CREATE OR REPLACE FUNCTION prevent_duplicate_worker_email()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    normalized_email text := nullif(lower(btrim(NEW.email::text)), '');
BEGIN
    -- Keep legacy duplicates editable until an administrator explicitly resolves them.
    IF TG_OP = 'UPDATE' AND NEW.tenant_id = OLD.tenant_id
       AND normalized_email IS NOT DISTINCT FROM nullif(lower(btrim(OLD.email::text)), '')
       AND NOT (NEW.status = 'ACTIVE' AND OLD.status <> 'ACTIVE') THEN
        RETURN NEW;
    END IF;
    IF normalized_email IS NULL THEN
        NEW.email := NULL;
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':' || normalized_email, 0));
    IF EXISTS (
        SELECT 1 FROM workers w WHERE w.tenant_id = NEW.tenant_id AND w.id <> NEW.id
          AND lower(btrim(w.email::text)) = normalized_email
    ) THEN
        RAISE EXCEPTION 'A worker profile already uses this email in this tenant. Link or update the existing profile.'
            USING ERRCODE = '23505', CONSTRAINT = 'uk_workers_tenant_email';
    END IF;
    NEW.email := normalized_email;
    RETURN NEW;
END;
$$;

CREATE TRIGGER workers_prevent_duplicate_email
BEFORE INSERT OR UPDATE OF email, tenant_id, status ON workers
FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_worker_email();
