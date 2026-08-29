DO $$
BEGIN
    CREATE TYPE communication_channel_type AS ENUM (
        'WORK_ORDER',
        'WORKER_OPERATIONS',
        'WORKER_DIRECT',
        'ANNOUNCEMENT'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE communication_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel_type communication_channel_type NOT NULL,
    work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE,
    title text NOT NULL,
    created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
    last_message_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_communication_work_order_thread
    ON communication_conversations (tenant_id, work_order_id)
    WHERE channel_type = 'WORK_ORDER' AND work_order_id IS NOT NULL;

CREATE INDEX idx_communication_conversations_tenant_last
    ON communication_conversations (tenant_id, COALESCE(last_message_at, created_at) DESC);

CREATE INDEX idx_communication_conversations_work_order
    ON communication_conversations (tenant_id, work_order_id);

CREATE TABLE communication_participants (
    conversation_id uuid NOT NULL REFERENCES communication_conversations(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
    participant_role text NOT NULL DEFAULT 'member',
    last_read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_communication_participants_user
    ON communication_participants (tenant_id, user_id);

CREATE INDEX idx_communication_participants_worker
    ON communication_participants (tenant_id, worker_id);

CREATE TABLE communication_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES communication_conversations(id) ON DELETE CASCADE,
    sender_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    sender_worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    edited_at timestamptz,
    deleted_at timestamptz
);

CREATE INDEX idx_communication_messages_conversation
    ON communication_messages (tenant_id, conversation_id, created_at);
