import { app } from "./app.js";
import { config } from "./config.js";
import { pool } from "./database.js";
import { log } from "./logger.js";
import { gracefulShutdown } from "./shutdown.js";

const server = app.listen(config.PORT, () => log("info", "server.started", { port: config.PORT }));
const stop = gracefulShutdown(server, () => pool.end());
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => void stop(signal));
