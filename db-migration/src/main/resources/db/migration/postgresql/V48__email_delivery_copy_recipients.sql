ALTER TABLE email_delivery_logs
    ADD COLUMN IF NOT EXISTS cc_emails text,
    ADD COLUMN IF NOT EXISTS bcc_emails text;
