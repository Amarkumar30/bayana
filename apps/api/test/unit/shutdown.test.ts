import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { gracefulShutdown, SHUTDOWN_GRACE_MS } from "../../src/shutdown.js";

// A real HTTP server with one slow route stands in for the API; the shutdown logic is the one server.ts installs.
let server: Server | undefined;
afterEach(() => { server?.closeAllConnections(); server?.close(); server = undefined; });
async function start(slowMs: number) {
  server = createServer((req, res) => { if (req.url === "/slow") setTimeout(() => res.end("done"), slowMs); else res.end("fast"); });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}
const get = (port: number, path: string) => new Promise<{ status?: number; body: string }>((resolve, reject) => {
  request({ host: "127.0.0.1", port, path, agent: false }, res => { let body = ""; res.on("data", chunk => body += chunk); res.on("end", () => resolve({ status: res.statusCode, body })); }).on("error", reject).end();
});

describe("graceful shutdown (SIGTERM on every Render deploy)", () => {
  it("lets the in-flight request finish, refuses new connections, then closes the pool and exits 0", async () => {
    const port = await start(300); const events: string[] = [];
    const stop = gracefulShutdown(server!, async () => { events.push("pool closed"); }, { exit: code => events.push(`exit ${code}`) });
    const inFlight = get(port, "/slow");
    await new Promise(resolve => setTimeout(resolve, 50));
    const stopped = stop("SIGTERM");
    await expect(get(port, "/fast")).rejects.toMatchObject({ code: "ECONNREFUSED" });
    expect(events).toEqual([]);
    await expect(inFlight).resolves.toEqual({ status: 200, body: "done" });
    await stopped;
    expect(events).toEqual(["pool closed", "exit 0"]);
  });
  it("cuts requests still running after the grace period, and still closes the pool and exits 0", async () => {
    const port = await start(5_000); const events: string[] = [];
    const stop = gracefulShutdown(server!, async () => { events.push("pool closed"); }, { graceMs: 200, exit: code => events.push(`exit ${code}`) });
    const inFlight = get(port, "/slow").catch(error => ({ cut: (error as { code?: string }).code }));
    await new Promise(resolve => setTimeout(resolve, 50));
    const started = Date.now(); await stop("SIGTERM");
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(await inFlight).toEqual({ cut: "ECONNRESET" });
    expect(events).toEqual(["pool closed", "exit 0"]);
  });
  it("runs once even when SIGTERM and SIGINT both arrive", async () => {
    await start(10); let exits = 0, closes = 0;
    const stop = gracefulShutdown(server!, async () => { closes++; }, { exit: () => exits++ });
    await Promise.all([stop("SIGTERM"), stop("SIGINT")]);
    expect({ exits, closes }).toEqual({ exits: 1, closes: 1 });
  });
  it("server.ts installs it for SIGTERM and SIGINT with the pool and a 10 s grace", async () => {
    expect(SHUTDOWN_GRACE_MS).toBe(10_000);
    const text = await readFile(new URL("../../src/server.ts", import.meta.url), "utf8");
    expect(text).toMatch(/gracefulShutdown\(server, \(\) => pool\.end\(\)\)/);
    expect(text).toMatch(/\["SIGTERM", "SIGINT"\]/);
  });
});
