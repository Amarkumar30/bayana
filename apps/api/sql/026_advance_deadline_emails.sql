-- The emails around an offline advance's deadline: the customer's "awaiting advance" email, the reminder, the expiry and the
-- extension. The list only grows, so every existing row still passes; nothing is dropped from the table and no data changes.
-- Forward-only and in one transaction (the runner wraps each file).

ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_template_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_check CHECK (template IN ('legacy', 'otp', 'hold_started', 'booking_request_vendor', 'booking_request_customer', 'advance_deadline_reminder', 'advance_deadline_expired', 'advance_deadline_extended', 'booking_confirmed_customer', 'booking_confirmed_vendor', 'booking_cancelled', 'refund_issued', 'reminder_24h', 'payment_review', 'payment_recorded', 'booking_rescheduled'));
