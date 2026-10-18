import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Production server is plain Node JavaScript so the runtime needs no dependencies.
import { createApp } from "../server.mjs";

test("production server supports Railway health checks, assets, SPA routes and safe failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "hack-server-"));
  await writeFile(join(root, "index.html"), "<main>Hack</main>");
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "assets", "app-abc.js"), 'console.log("hack");');
  await writeFile(join(root, "sw.js"), "// worker");
  const server = createApp(root);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(base + "/healthz");
    assert.equal(health.status, 200);
    assert.equal(await health.text(), "ok");
    const home = await fetch(base + "/");
    assert.match(home.headers.get("content-type")!, /text\/html/);
    assert.equal(await home.text(), "<main>Hack</main>");
    assert.equal(home.headers.get("cache-control"), "no-cache");
    const route = await fetch(base + "/games/one");
    assert.equal(await route.text(), "<main>Hack</main>");
    const asset = await fetch(base + "/assets/app-abc.js");
    assert.match(asset.headers.get("content-type")!, /javascript/);
    assert.match(asset.headers.get("cache-control")!, /immutable/);
    const worker = await fetch(base + "/sw.js");
    assert.equal(worker.headers.get("cache-control"), "no-cache");
    assert.equal((await fetch(base + "/assets/missing.js")).status, 404);
    assert.equal((await fetch(base + "/%00")).status, 400);
    assert.equal((await fetch(base + "/", { method: "POST" })).status, 405);
    const head = await fetch(base + "/", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
});
