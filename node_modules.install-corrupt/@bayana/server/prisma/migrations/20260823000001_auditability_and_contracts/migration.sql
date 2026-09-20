CREATE TABLE "contracts" (
  "id" TEXT PRIMARY KEY,
  "booking_id" TEXT NOT NULL UNIQUE REFERENCES "bookings"("id") ON DELETE RESTRICT,
  "business_name" TEXT NOT NULL,
  "client_name" TEXT NOT NULL,
  "event_date" DATE NOT NULL,
  "advance_amount_paise" INTEGER NOT NULL,
  "total_amount_paise" INTEGER NOT NULL,
  "terms" TEXT NOT NULL,
  "accepted_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "booking_history" (
  "id" TEXT PRIMARY KEY,
  "booking_id" TEXT NOT NULL REFERENCES "bookings"("id") ON DELETE RESTRICT,
  "vendor_id" TEXT NOT NULL REFERENCES "vendors"("id") ON DELETE RESTRICT,
  "from_status" "BookingStatus",
  "to_status" "BookingStatus" NOT NULL,
  "actor" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "booking_history_booking_id_created_at_idx" ON "booking_history"("booking_id", "created_at");
-- Audit history is append-only even for direct SQL access, not merely by convention in application code.
CREATE FUNCTION prevent_booking_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'booking_history is append-only'; END; $$;
CREATE TRIGGER booking_history_no_update BEFORE UPDATE ON "booking_history" FOR EACH ROW EXECUTE FUNCTION prevent_booking_history_mutation();
CREATE TRIGGER booking_history_no_delete BEFORE DELETE ON "booking_history" FOR EACH ROW EXECUTE FUNCTION prevent_booking_history_mutation();
-- Paise remain whole numbers (scale 0), while NUMERIC avoids overflow/rounding semantics in financial storage.
ALTER TABLE "vendors" ALTER COLUMN "advance_amount_paise" TYPE NUMERIC(12,0), ALTER COLUMN "total_amount_paise" TYPE NUMERIC(12,0);
ALTER TABLE "bookings" ALTER COLUMN "advance_amount_paise" TYPE NUMERIC(12,0), ALTER COLUMN "total_amount_paise" TYPE NUMERIC(12,0);
ALTER TABLE "payments" ALTER COLUMN "amount_paise" TYPE NUMERIC(12,0);
ALTER TABLE "contracts" ALTER COLUMN "advance_amount_paise" TYPE NUMERIC(12,0), ALTER COLUMN "total_amount_paise" TYPE NUMERIC(12,0);
