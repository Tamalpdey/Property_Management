CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE tenant_status AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE user_status AS ENUM ('INVITED', 'ACTIVE', 'DISABLED', 'LOCKED');
CREATE TYPE work_order_status AS ENUM (
    'CREATED',
    'SCHEDULED',
    'ASSIGNED',
    'TRAVELING',
    'ON_SITE',
    'IN_PROGRESS',
    'PAUSED',
    'COMPLETED',
    'APPROVED',
    'CUSTOMER_NOTIFIED',
    'INVOICED',
    'PAID',
    'CANCELLED'
);
CREATE TYPE work_order_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE worker_status AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED');
CREATE TYPE invoice_status AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'VOID');
CREATE TYPE payment_status AS ENUM ('PENDING', 'RECEIVED', 'FAILED', 'REFUNDED');
CREATE TYPE payroll_status AS ENUM ('OPEN', 'READY', 'APPROVED', 'PAID');
CREATE TYPE notification_channel AS ENUM ('EMAIL', 'IN_APP', 'SMS', 'PUSH');

CREATE TABLE schema_milestones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_milestones (name) VALUES ('lorne-initial-schema');
