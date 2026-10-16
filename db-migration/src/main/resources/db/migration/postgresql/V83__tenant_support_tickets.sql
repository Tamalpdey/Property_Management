CREATE TABLE support_tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ticket_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 160),
    description text NOT NULL CHECK (length(description) BETWEEN 1 AND 8000),
    category text NOT NULL CHECK (category IN ('ACCESS','SETUP','WORK_ORDERS','INVOICING','QUOTES','BUG','OTHER')),
    priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
    status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','WAITING_ON_TENANT','RESOLVED','CLOSED')),
    created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    assigned_to uuid REFERENCES app_users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    UNIQUE (id, tenant_id)
);

CREATE INDEX idx_support_tickets_tenant_updated ON support_tickets(tenant_id, updated_at DESC, id DESC);
CREATE INDEX idx_support_tickets_status_updated ON support_tickets(status, updated_at DESC, id DESC);

CREATE TABLE support_ticket_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    author_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
    author_type text NOT NULL CHECK (author_type IN ('TENANT','SUPPORT')),
    body text NOT NULL CHECK (length(body) BETWEEN 1 AND 8000),
    internal boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (ticket_id, tenant_id) REFERENCES support_tickets(id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX idx_support_ticket_messages_thread ON support_ticket_messages(ticket_id, created_at, id);
