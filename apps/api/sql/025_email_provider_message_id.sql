-- The email provider's id for a sent email (Brevo's messageId), so a delivery can be traced in Brevo's logs without
-- storing or logging the address. NULL for rows sent before this migration and for SMTP, log and capture sends.
-- Forward-only and in one transaction (the runner wraps each file). Additive: nothing is changed, dropped or renamed.

ALTER TABLE email_outbox ADD COLUMN provider_message_id text;
