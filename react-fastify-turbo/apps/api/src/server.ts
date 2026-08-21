import "./instrument";
import { createDb } from "@repo/db";
import { env } from "@repo/env/api";
import { createLogger } from "@repo/logger";

import { buildApp } from "./app";

const app = await buildApp({
    db: createDb(env.DATABASE_URL),
    logger: createLogger({ pretty: process.env.NODE_ENV === "development" }),
    corsOrigin: env.CORS_ORIGIN,
    upstash:
        env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
            ? { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }
            : undefined,
});

await app.listen({ port: env.PORT, host: "0.0.0.0" });
