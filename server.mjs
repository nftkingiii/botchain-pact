import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";

const port = Number(process.env.PORT || 4319);
const host = "0.0.0.0";
const root = resolve("dist");
const rpcUrl = process.env.BOT_CHAIN_RPC || "https://rpc.bohr.life";
const allowedRpc = new Set(["eth_chainId", "eth_blockNumber", "eth_getCode", "eth_call"]);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

function headers(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; connect-src 'self'; font-src 'self' data: https://fonts.gstatic.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
}

async function bodyJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error("Request too large.");
  }
  return JSON.parse(raw);
}

const server = createServer(async (req, res) => {
  headers(res);
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === "/healthz" || url.pathname === "/api/healthz") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname === "/revision") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ revision: process.env.APP_REVISION || "local" }));
    return;
  }
  if (url.pathname === "/api/rpc") {
    if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
    try {
      const payload = await bodyJson(req);
      if (!payload || !allowedRpc.has(payload.method) || !Array.isArray(payload.params)) {
        res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "Unsupported read-only RPC method." })); return;
      }
      const upstream = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: payload.method, params: payload.params }), signal: AbortSignal.timeout(12_000) });
      res.writeHead(upstream.status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(await upstream.text());
    } catch {
      res.writeHead(502, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify({ error: "BOT Chain read is unavailable. Try again shortly." }));
    }
    return;
  }
  let requested;
  try { requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname); }
  catch { res.writeHead(400); res.end(); return; }
  const candidate = resolve(root, `.${requested}`);
  const safe = candidate === root || candidate.startsWith(root + sep);
  const file = safe && existsSync(candidate) && statSync(candidate).isFile() ? candidate : resolve(root, "index.html");
  if (!existsSync(file)) { res.writeHead(503, { "content-type": "text/plain" }); res.end("Build the app first with npm run build."); return; }
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": file.endsWith("index.html") ? "no-cache" : "public, max-age=3600" });
  createReadStream(file).pipe(res);
});

server.listen(port, host, () => console.log(`Pact listening on http://${host}:${port}`));
