-- Keep the protected URL recoverable; passwords remain bcrypt hashes on quotes.
CREATE TABLE quote_share_links (
    quote_id uuid PRIMARY KEY REFERENCES quotes(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_quote_share_token CHECK (token ~ '^[A-Za-z0-9_-]{43}$')
);

-- Preserve the currently valid link from earlier email deliveries, never an old rotated link.
INSERT INTO quote_share_links(quote_id, tenant_id, token)
SELECT DISTINCT ON (q.id) q.id, q.tenant_id, link.parts[1]
FROM quotes q
JOIN email_delivery_logs email ON email.quote_id = q.id AND email.tenant_id = q.tenant_id
CROSS JOIN LATERAL regexp_matches(coalesce(email.body, ''), '/quote-response/([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])', 'g') AS link(parts)
WHERE q.approval_token_hash = encode(digest(link.parts[1], 'sha256'), 'hex')
ORDER BY q.id, email.created_at DESC;
