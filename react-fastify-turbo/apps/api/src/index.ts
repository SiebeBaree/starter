import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", () => ({ status: "ok" }));

await app.listen({ port: 3001 });
