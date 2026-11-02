-- READ-ONLY check: customer accounts that Google sign-in turned into vendor accounts by mistake (fixed in branch
-- customer-bookings, 2 November 2026). Before the fix, a customer who signed in with Google from the login page (for example
-- through "My bookings") was set to role VENDOR, given a vendor-terms consent with source 'signup_google', and sent to
-- onboarding. This lists accounts that:
--   * are VENDOR now,
--   * have bookings as a customer (by account or by their email),
--   * never agreed to the vendor terms any other way (the email sign-up records source 'signup_email'),
--   * never really set up a business: no vendor profile, or an unpublished profile with no services.
-- Run it in a read-only transaction; it changes nothing:
--   BEGIN READ ONLY;  <this query>;  ROLLBACK;
-- It returns ids and dates only. Add u.email to the SELECT list if you need to contact someone.

SELECT u.id AS user_id,
       u.created_at AS account_created,
       (SELECT min(c.created_at) FROM consents c WHERE c.user_id = u.id AND c.kind = 'vendor_terms') AS became_vendor_at,
       (SELECT count(*) FROM bookings b WHERE b.client_user_id = u.id OR b.client_email = u.email) AS customer_bookings,
       v.id IS NOT NULL AS has_vendor_profile,
       COALESCE(v.published, false) AS published,
       (SELECT count(*) FROM services s WHERE s.vendor_id = v.id) AS services
FROM users u
LEFT JOIN vendors v ON v.owner_user_id = u.id
WHERE u.role = 'VENDOR'
  AND u.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM bookings b WHERE b.client_user_id = u.id OR b.client_email = u.email)
  AND EXISTS (SELECT 1 FROM consents c WHERE c.user_id = u.id AND c.kind = 'vendor_terms' AND c.source = 'signup_google')
  AND NOT EXISTS (SELECT 1 FROM consents c WHERE c.user_id = u.id AND c.kind = 'vendor_terms' AND c.source <> 'signup_google')
  AND (v.id IS NULL OR (NOT v.published AND NOT EXISTS (SELECT 1 FROM services s WHERE s.vendor_id = v.id)))
ORDER BY became_vendor_at;
