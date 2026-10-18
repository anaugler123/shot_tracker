import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export function createApp(
  root = fileURLToPath(new URL("./dist/", import.meta.url)),
) {
  root = resolve(root);
  return createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end();
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (pathname.includes("\0")) throw new Error("Invalid path");
    } catch {
      res.writeHead(400);
      return res.end("Invalid request");
    }
    if (pathname === "/healthz") {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
      });
      return res.end(req.method === "HEAD" ? undefined : "ok");
    }
    let path = resolve(root, "." + pathname);
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    if (pathname === "/") path = resolve(root, "index.html");
    try {
      let info;
      try {
        info = await stat(path);
      } catch {
        /* Resolve SPA routes below. */
      }
      if (!info?.isFile()) {
        // Never return HTML for a missing script, service worker, or other file.
        if (extname(pathname) || pathname.startsWith("/assets/")) {
          res.writeHead(404);
          return res.end("Not found");
        }
        path = resolve(root, "index.html");
        info = await stat(path);
      }
      const immutable = path.startsWith(resolve(root, "assets") + sep);
      res.writeHead(200, {
        "Content-Type": mime[extname(path)] || "application/octet-stream",
        "Content-Length": info.size,
        "Cache-Control": immutable
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
      if (req.method === "HEAD") return res.end();
      const stream = createReadStream(path);
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    } catch {
      res.writeHead(500);
      res.end("Application build is unavailable");
    }
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid PORT");
  const server = createApp();
  server.listen(port, "0.0.0.0", () =>
    console.log(`Hack listening on port ${server.address().port}`),
  );
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
