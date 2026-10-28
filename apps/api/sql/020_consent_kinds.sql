-- Legal pages (SPEC 4.9 PV-01, 20.3): two more policies are agreed to and recorded. Vendors accept the vendor agreement at
-- signup; customers accept the refund policy (and the platform terms) when they agree to a booking. Widens the allowed kinds
-- only: no row changes, nothing is removed.
ALTER TABLE consents DROP CONSTRAINT consents_kind_check;
ALTER TABLE consents ADD CONSTRAINT consents_kind_check CHECK (kind IN ('account_terms', 'privacy_policy', 'booking_terms', 'refund_policy', 'vendor_terms'));
