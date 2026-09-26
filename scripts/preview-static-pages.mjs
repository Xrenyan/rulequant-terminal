import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Local-only preview of the exact GitHub Pages export, including its URL prefix.
const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out"));
const prefix = "/rulequant-terminal-pages";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2" };
const server = http.createServer((request, response) => {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405); response.end(); return; }
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/") { response.writeHead(302, { Location: `${prefix}/dashboard/` }); response.end(); return; }
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) throw new Error("Outside export");
    let file = path.resolve(root, `.${pathname.slice(prefix.length) || "/"}`);
    if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    file = fs.realpathSync(file);
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error("Outside export");
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(file).pipe(response);
  } catch { response.writeHead(404); response.end("Not found"); }
});
server.listen(3001, "127.0.0.1", () => process.stdout.write(`Static preview: http://localhost:3001${prefix}/dashboard/\n`));
process.on("SIGINT", () => server.close());
