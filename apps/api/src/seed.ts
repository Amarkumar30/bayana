import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { pool } from "./database.js";
import { log } from "./logger.js";

if (config.NODE_ENV !== "development") throw new Error("The development seed runs only when NODE_ENV=development");
const slug = "rahul-photography";
await pool.query("INSERT INTO photographers(id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled,categories) VALUES($1,$2,'Rahul Photography','Delhi','Candid wedding and celebration photographer.',500000,'PERCENT',20,true,true,ARRAY['Photography']) ON CONFLICT (slug) DO NOTHING", [randomUUID(), slug]);
const photographer = await pool.query<{ id: string }>("SELECT id FROM photographers WHERE slug=$1", [slug]);
const photographerId = photographer.rows[0]?.id;
if (!photographerId) throw new Error("Seed photographer was not created");
const service = await pool.query("SELECT 1 FROM services WHERE photographer_id=$1 AND name='Celebration coverage'", [photographerId]);
if (!service.rowCount) await pool.query("INSERT INTO services(id,photographer_id,name,description,price_paise,duration_minutes) VALUES($1,$2,'Celebration coverage','Event photography coverage',500000,480)", [randomUUID(), photographerId]);
for (let offset = 1; offset <= 12; offset++) await pool.query("INSERT INTO availability(photographer_id,event_date,state,price_paise) VALUES($1,current_date + $2,'AVAILABLE',$3) ON CONFLICT DO NOTHING", [photographerId, offset, offset === 3 ? 650000 : null]);
log("info", "seed.completed", { slug });
await pool.end();
