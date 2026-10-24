import { app } from "./app.js";
import { config } from "./config.js";
import { log } from "./logger.js";

app.listen(config.PORT, () => log("info", "server.started", { port: config.PORT }));
