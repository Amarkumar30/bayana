-- Phase 3: replace the photography-specific domain vocabulary without copying
-- or discarding existing records. This migration is intentionally forward-only.

ALTER TABLE photographers RENAME TO vendors;
ALTER TABLE availability RENAME COLUMN photographer_id TO vendor_id;
ALTER TABLE availability_slots RENAME COLUMN photographer_id TO vendor_id;
ALTER TABLE bookings RENAME COLUMN photographer_id TO vendor_id;
ALTER TABLE services RENAME COLUMN photographer_id TO vendor_id;

ALTER TABLE vendors RENAME CONSTRAINT photographers_pkey TO vendors_pkey;
ALTER TABLE vendors RENAME CONSTRAINT photographers_slug_key TO vendors_slug_key;
ALTER TABLE vendors RENAME CONSTRAINT photographers_owner_user_id_key TO vendors_owner_user_id_key;
ALTER TABLE vendors RENAME CONSTRAINT photographers_owner_user_id_fkey TO vendors_owner_user_id_fkey;
ALTER TABLE vendors RENAME CONSTRAINT photographers_advance_type_check TO vendors_advance_type_check;
ALTER TABLE vendors RENAME CONSTRAINT photographers_advance_value_check TO vendors_advance_value_check;
ALTER TABLE vendors RENAME CONSTRAINT photographers_base_price_paise_check TO vendors_base_price_paise_check;
ALTER TABLE availability RENAME CONSTRAINT availability_photographer_id_fkey TO availability_vendor_id_fkey;
ALTER TABLE bookings RENAME CONSTRAINT bookings_photographer_id_fkey TO bookings_vendor_id_fkey;
ALTER TABLE services RENAME CONSTRAINT services_photographer_id_fkey TO services_vendor_id_fkey;
ALTER TABLE availability_slots RENAME CONSTRAINT availability_slots_photographer_id_fkey TO availability_slots_vendor_id_fkey;
ALTER TABLE availability_slots RENAME CONSTRAINT availability_slots_photographer_id_event_date_starts_at_key TO availability_slots_vendor_id_event_date_starts_at_key;

ALTER INDEX one_active_booking_per_day RENAME TO one_active_booking_per_vendor_day;
ALTER INDEX one_active_booking_per_slot RENAME TO one_active_booking_per_vendor_slot;

ALTER TABLE users DROP CONSTRAINT users_role_check;
UPDATE users SET role='VENDOR' WHERE role='PHOTOGRAPHER';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('VENDOR','CLIENT','ADMIN'));
ALTER TABLE auth_otps DROP CONSTRAINT auth_otps_role_check;
UPDATE auth_otps SET role='VENDOR' WHERE role='PHOTOGRAPHER';
ALTER TABLE auth_otps ADD CONSTRAINT auth_otps_role_check CHECK (role IN ('VENDOR','CLIENT'));

CREATE TABLE categories (
  slug citext PRIMARY KEY,
  label text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
CREATE TABLE vendor_categories (
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  category_slug citext NOT NULL REFERENCES categories(slug),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_id, category_slug)
);
CREATE INDEX vendor_categories_category_idx ON vendor_categories(category_slug, vendor_id);

INSERT INTO categories(slug,label) VALUES
  ('photography','Photography'),
  ('beauty-and-salon','Beauty and salon'),
  ('tutoring','Tutoring'),
  ('coaching-and-consulting','Coaching and consulting'),
  ('fitness','Fitness'),
  ('events','Events'),
  ('repair-and-maintenance','Repair and maintenance'),
  ('other','Other');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM vendors v CROSS JOIN LATERAL unnest(v.categories) AS c(value)
    WHERE lower(regexp_replace(trim(c.value), '[^a-z0-9]+', '-', 'g')) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ) THEN
    RAISE EXCEPTION 'cannot migrate invalid legacy category values';
  END IF;
END $$;

INSERT INTO categories(slug,label)
SELECT normalized_slug, min(label)
FROM (
  SELECT lower(regexp_replace(trim(c.value), '[^a-z0-9]+', '-', 'g')) AS normalized_slug,
         trim(c.value) AS label
  FROM vendors v CROSS JOIN LATERAL unnest(v.categories) AS c(value)
) legacy
GROUP BY normalized_slug
ON CONFLICT (slug) DO NOTHING;

INSERT INTO vendor_categories(vendor_id,category_slug)
SELECT v.id, lower(regexp_replace(trim(c.value), '[^a-z0-9]+', '-', 'g'))
FROM vendors v CROSS JOIN LATERAL unnest(v.categories) AS c(value);

ALTER TABLE vendors DROP COLUMN categories;

CREATE TABLE vendor_slug_history (
  slug citext PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
CREATE INDEX vendor_slug_history_vendor_idx ON vendor_slug_history(vendor_id);
