import { join, resolve } from "node:path";

// The CLI lives inside the starter repo and the templates are its siblings. Resolved from this file's real
// location, so it works through the ~/.local/bin symlink and from any cwd.
const STARTER_ROOT = resolve(import.meta.dir, "..", "..");

export const TEMPLATES = {
    next: {
        label: "Next.js fullstack",
        dir: join(STARTER_ROOT, "nextjs"),
    },
    "react-fastify": {
        label: "React + Fastify Turborepo",
        dir: join(STARTER_ROOT, "react-fastify-turbo"),
    },
} as const;

export type TemplateKey = keyof typeof TEMPLATES;

export const SERVICES = {
    neon: "Neon Postgres",
    upstash: "Upstash Redis",
    axiom: "Axiom",
    posthog: "PostHog",
    sentry: "Sentry",
} as const;

export type ServiceKey = keyof typeof SERVICES;

export const TOKEN_KEYS = ["github", "vercel", "neon", "upstash", "axiom", "posthog", "sentry", "sentryCi"] as const;
export type TokenKey = (typeof TOKEN_KEYS)[number];

// Everything lives in the EU.
export const NEON_REGION = "aws-eu-central-1";
export const UPSTASH_PRIMARY_REGION = "eu-central-1";
export const VERCEL_FUNCTION_REGION = "fra1";
export const POSTHOG_HOST = "https://eu.posthog.com";

export const TOKEN_HELP: Record<TokenKey, { label: string; createUrl: string; note?: string }> = {
    github: {
        label: "GitHub",
        createUrl: "https://github.com/settings/tokens",
        note: "classic PAT with repo, workflow and read:org scopes; workflow is needed to push .github/workflows/ci.yml",
    },
    vercel: { label: "Vercel", createUrl: "https://vercel.com/account/settings/tokens" },
    neon: { label: "Neon", createUrl: "https://console.neon.tech/app/settings/api-keys" },
    upstash: {
        label: "Upstash",
        createUrl: "https://console.upstash.com/account/api",
        note: "store as email:api_key",
    },
    axiom: { label: "Axiom", createUrl: "https://app.axiom.co/settings/api-tokens" },
    posthog: { label: "PostHog", createUrl: `${POSTHOG_HOST}/settings/user-api-keys` },
    sentry: {
        label: "Sentry",
        createUrl: "https://sentry.io/settings/account/api/auth-tokens/",
        note: "user auth token with org:read, team:read, project:read and project:write scopes",
    },
    sentryCi: {
        label: "SentryCI",
        createUrl: "https://sentry.io/orgredirect/organizations/:orgslug/settings/auth-tokens/",
        note: "org auth token (sntrys_), created once per org in Organization Settings > Auth Tokens; becomes SENTRY_AUTH_TOKEN for source map upload. Sentry's org-auth-tokens API is session-only, so the CLI cannot create it",
    },
};
