import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [reactRouter(), tailwindcss()],
    resolve: {
        alias: { "@": new URL("./src", import.meta.url).pathname },
    },
    server: {
        // Mirrors the PostHog rewrites in vercel.json so the /api/pipe relay also works in dev.
        proxy: {
            "/api/pipe/static": {
                target: "https://eu-assets.i.posthog.com",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/pipe\/static/, "/static"),
            },
            "/api/pipe": {
                target: "https://eu.i.posthog.com",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/pipe/, ""),
            },
        },
    },
});
