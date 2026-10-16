CREATE TABLE quote_capture_links (
    quote_id uuid PRIMARY KEY REFERENCES quotes(id),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    token varchar(43) NOT NULL UNIQUE,
    token_hash varchar(64) NOT NULL UNIQUE,
    password_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    failed_attempts integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quote_site_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    quote_id uuid NOT NULL REFERENCES quotes(id),
    author_name varchar(120) NOT NULL,
    body text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
    source varchar(20) NOT NULL CHECK (source IN ('TENANT_PORTAL', 'SITE_LINK')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_quote_site_notes_quote ON quote_site_notes(tenant_id, quote_id, created_at);

CREATE TABLE quote_photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    quote_id uuid NOT NULL REFERENCES quotes(id),
    document_id uuid NOT NULL UNIQUE REFERENCES documents(id),
    caption varchar(500) NOT NULL DEFAULT '',
    client_visible boolean NOT NULL DEFAULT true,
    author_name varchar(120) NOT NULL,
    source varchar(20) NOT NULL CHECK (source IN ('TENANT_PORTAL', 'SITE_LINK')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (quote_id, upload_id)
);
CREATE INDEX ix_quote_photos_quote ON quote_photos(tenant_id, quote_id, created_at);

-- Lock the parent to serialize capture with publication and client approval.
CREATE FUNCTION protect_quote_capture_content() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text; parent_tenant uuid; parent_id uuid;
BEGIN
    parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.quote_id ELSE NEW.quote_id END;
    SELECT status, tenant_id INTO parent_status, parent_tenant FROM quotes WHERE id = parent_id FOR UPDATE;
    IF parent_status NOT IN ('DRAFT', 'DECLINED') THEN
        RAISE EXCEPTION 'Quote capture content is locked after publication';
    END IF;
    IF TG_OP <> 'DELETE' THEN
        IF NEW.tenant_id <> parent_tenant OR (TG_OP = 'UPDATE' AND (NEW.quote_id <> OLD.quote_id OR NEW.tenant_id <> OLD.tenant_id)) THEN
            RAISE EXCEPTION 'Quote capture ownership cannot change';
        END IF;
        IF TG_TABLE_NAME = 'quote_photos' THEN
            IF NOT EXISTS (SELECT 1 FROM documents WHERE id = NEW.document_id AND tenant_id = NEW.tenant_id
                AND owner_type = 'QUOTE' AND owner_id = NEW.quote_id) THEN
                RAISE EXCEPTION 'Photo document does not belong to this quote';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
    RETURN OLD;
END $$;
CREATE TRIGGER quote_photos_content_lock BEFORE INSERT OR UPDATE OR DELETE ON quote_photos
    FOR EACH ROW EXECUTE FUNCTION protect_quote_capture_content();
CREATE TRIGGER quote_notes_content_lock BEFORE INSERT OR UPDATE OR DELETE ON quote_site_notes
    FOR EACH ROW EXECUTE FUNCTION protect_quote_capture_content();

CREATE FUNCTION close_quote_capture_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status NOT IN ('DRAFT', 'DECLINED') THEN
        UPDATE quote_capture_links SET revoked_at = coalesce(revoked_at, now()) WHERE quote_id = NEW.id;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER quotes_close_capture AFTER UPDATE OF status ON quotes
    FOR EACH ROW EXECUTE FUNCTION close_quote_capture_link();
