import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import worker from "./index.js";
import { createPostgresAdapter } from "./postgres-adapter.js";

const root = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(root, "../../../apps/web");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, {
  ssl: process.env.DATABASE_SSL === "true" ? "require" : false,
  max: Number(process.env.DATABASE_POOL_SIZE || 5),
  idle_timeout: 20
});
const DB = createPostgresAdapter(sql);
const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 10 * 1024 * 1024 });

async function apiHandler(request, reply) {
  const protocol = request.headers["x-forwarded-proto"] || request.protocol || "http";
  const hostHeader = request.headers["x-forwarded-host"] || request.headers.host;
  const url = `${protocol}://${hostHeader}${request.raw.url}`;
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : JSON.stringify(request.body ?? {});
  const webRequest = new Request(url, { method: request.method, headers: request.headers, body });
  const response = await worker.fetch(webRequest, {
    DB,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || `${protocol}://${hostHeader},http://localhost:8000`
  });
  reply.code(response.status);
  response.headers.forEach((value, key) => reply.header(key, value));
  return reply.send(Buffer.from(await response.arrayBuffer()));
}

app.route({ method: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], url: "/api/*", handler: apiHandler });
app.route({ method: ["GET", "OPTIONS"], url: "/health", handler: apiHandler });
await app.register(fastifyStatic, { root: webRoot, prefix: "/" });
app.setNotFoundHandler((request, reply) => {
  if (request.method === "GET" && !request.url.startsWith("/api/")) return reply.sendFile("index.html");
  return reply.code(404).send({ error: "Маршрут не найден." });
});

const close = async signal => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on("SIGTERM", () => close("SIGTERM"));
process.on("SIGINT", () => close("SIGINT"));

await app.listen({ port, host });
