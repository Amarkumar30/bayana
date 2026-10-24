import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { pool } from "./database.js";
import { log } from "./logger.js";

if (config.NODE_ENV !== "development") throw new Error("The development seed runs only when NODE_ENV=development");
const slug = "rahul-services";
await pool.query("INSERT INTO vendors(id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled) VALUES($1,$2,'Rahul Services','Delhi','Independent event services.',500000,'PERCENT',20,true,true) ON CONFLICT (slug) DO NOTHING", [randomUUID(), slug]);
const vendor = await pool.query<{ id: string }>("SELECT id FROM vendors WHERE slug=$1", [slug]);
const vendorId = vendor.rows[0]?.id;
if (!vendorId) throw new Error("Seed vendor was not created");
await pool.query("INSERT INTO vendor_categories(vendor_id,category_slug) VALUES($1,'events') ON CONFLICT DO NOTHING", [vendorId]);
const service = await pool.query("SELECT 1 FROM services WHERE vendor_id=$1 AND name='Celebration service'", [vendorId]);
if (!service.rowCount) await pool.query("INSERT INTO services(id,vendor_id,name,description,price_paise,duration_minutes) VALUES($1,$2,'Celebration service','Event planning and coordination',500000,480)", [randomUUID(), vendorId]);
for (let offset = 1; offset <= 12; offset++) await pool.query("INSERT INTO availability(vendor_id,event_date,state,price_paise) VALUES($1,current_date + $2,'AVAILABLE',$3) ON CONFLICT DO NOTHING", [vendorId, offset, offset === 3 ? 650000 : null]);
log("info", "seed.completed", { slug });
await pool.end();
