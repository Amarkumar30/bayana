ALTER TABLE "vendors" ADD COLUMN "service_type" TEXT NOT NULL DEFAULT 'Wedding services', ADD COLUMN "location" TEXT;
CREATE TABLE "blocked_dates" (
  "id" TEXT PRIMARY KEY,
  "vendor_id" TEXT NOT NULL REFERENCES "vendors"("id") ON DELETE RESTRICT,
  "event_date" DATE NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("vendor_id", "event_date")
);
