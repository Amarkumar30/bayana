import "dotenv/config";

// Runs before every test file: refuse to touch anything but a *_test database.
if (process.env.NODE_ENV !== "test") throw new Error("Tests must run with NODE_ENV=test (use pnpm.cmd test)");
const url = process.env.DATABASE_URL_TEST;
if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Tests require DATABASE_URL_TEST naming a database ending in _test");
