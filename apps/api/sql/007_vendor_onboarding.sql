ALTER TABLE vendors ADD COLUMN public_contact_email boolean NOT NULL DEFAULT false;
ALTER TABLE vendors ADD COLUMN public_contact_phone boolean NOT NULL DEFAULT false;

ALTER TABLE services ADD COLUMN buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_before_minutes BETWEEN 0 AND 1440);
ALTER TABLE services ADD COLUMN buffer_after_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_after_minutes BETWEEN 0 AND 1440);
ALTER TABLE services ADD COLUMN booking_mode text NOT NULL DEFAULT 'FULL_DAY' CHECK (booking_mode IN ('TIMED','FULL_DAY'));
ALTER TABLE services ADD COLUMN advance_type text NOT NULL DEFAULT 'PERCENT' CHECK (advance_type IN ('NONE','PERCENT','FIXED'));
ALTER TABLE services ADD COLUMN advance_value integer NOT NULL DEFAULT 1 CHECK (advance_value >= 0);
ALTER TABLE services ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE services ADD COLUMN customer_details_prompt text NOT NULL DEFAULT '';
ALTER TABLE services ADD CONSTRAINT services_advance_rule_check CHECK ((advance_type='NONE' AND advance_value=0) OR (advance_type='PERCENT' AND advance_value BETWEEN 1 AND 100) OR (advance_type='FIXED' AND advance_value > 0));
CREATE INDEX services_vendor_sort_idx ON services(vendor_id,sort_order,created_at);
