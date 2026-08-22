import * as p from "@clack/prompts";
import { $ } from "bun";

import { CREDENTIALS_PATH, type Credentials } from "./config";
import { POSTHOG_HOST, TOKEN_HELP, TOKEN_KEYS, type TokenKey } from "./constants";
import { api, ApiError, basic, bearer } from "./http";
import { orgTokenPayload } from "./services/sentry";

// One cheap authenticated GET per service proves the token actually works, not just that it exists.
const PROBES: Record<TokenKey, (token: string) => Promise<unknown>> = {
    github: (t) =>
        api("GitHub", "https://api.github.com/user", {
            headers: { ...bearer(t), Accept: "application/vnd.github+json" },
        }),
    vercel: (t) => api("Vercel", "https://api.vercel.com/v2/user", { headers: bearer(t) }),
    neon: (t) => api("Neon", "https://console.neon.tech/api/v2/users/me", { headers: bearer(t) }),
    upstash: (t) => api("Upstash", "https://api.upstash.com/v2/redis/databases", { headers: basic(t) }),
    axiom: async (t) => {
        // Personal tokens answer /user, org API tokens do not, so fall back to listing orgs.
        try {
            await api("Axiom", "https://api.axiom.co/v2/user", { headers: bearer(t) });
        } catch {
            await api("Axiom", "https://api.axiom.co/v2/orgs", { headers: bearer(t) });
        }
    },
    posthog: (t) => api("PostHog", `${POSTHOG_HOST}/api/users/@me/`, { headers: bearer(t) }),
    sentry: (t) => api("Sentry", "https://sentry.io/api/0/organizations/", { headers: bearer(t) }),
    sentryCi: (t) => {
        // The org slug and region silo are baked into the token itself, releases is the cheapest org:ci endpoint.
        const { org, regionUrl } = orgTokenPayload(t);
        return api("Sentry", `${regionUrl}/api/0/organizations/${org}/releases/`, { headers: bearer(t) });
    },
};

export type DoctorReport = Record<TokenKey, { ok: boolean; detail: string }>;

export async function runDoctor(creds: Credentials): Promise<DoctorReport> {
    await Promise.all(
        ["git", "pnpm"].map(async (binary) => {
            try {
                await $`${{ raw: binary }} --version`.quiet();
            } catch {
                p.log.error(`${binary} is not installed or not on PATH.`);
                process.exit(1);
            }
        }),
    );

    const spinner = p.spinner();
    spinner.start("Checking service tokens");
    const report = {} as DoctorReport;
    await Promise.all(
        TOKEN_KEYS.map(async (key) => {
            const token = creds[key];
            if (!token) {
                report[key] = { ok: false, detail: "missing" };
                return;
            }
            // Org tokens only carry the CI scope (source maps, releases). Project creation, teams and
            // client keys all 403, so reject them up front instead of surfacing a bare 403 later.
            if (key === "sentry" && token.startsWith("sntrys_")) {
                report[key] = { ok: false, detail: "org token (sntrys_) belongs in sentryCi. Use a user auth token" };
                return;
            }
            if (key === "sentryCi" && !token.startsWith("sntrys_")) {
                report[key] = { ok: false, detail: "not an org token, expected sntrys_..." };
                return;
            }
            try {
                await PROBES[key](token);
                report[key] = { ok: true, detail: "ok" };
            } catch (error) {
                report[key] = {
                    ok: false,
                    detail: error instanceof ApiError ? `rejected (${error.status})` : "unreachable",
                };
            }
        }),
    );
    spinner.stop("Checked service tokens");
    p.note(
        TOKEN_KEYS.map((key) => {
            const { ok, detail } = report[key];
            return `${ok ? "✓" : "✗"} ${TOKEN_HELP[key].label.padEnd(8)} ${detail}`;
        }).join("\n"),
        "Doctor",
    );
    return report;
}

export function assertTokens(needed: TokenKey[], report: DoctorReport): void {
    const bad = [...new Set(needed)].filter((key) => !report[key].ok);
    if (bad.length === 0) return;
    const lines = bad.map((key) => {
        const help = TOKEN_HELP[key];
        return `${help.label}: ${report[key].detail}, create one at ${help.createUrl}${help.note ? ` (${help.note})` : ""}`;
    });
    p.log.error(
        `Tokens required for the selected services are not usable in ${CREDENTIALS_PATH}:\n${lines.join("\n")}`,
    );
    p.outro("Add the tokens and re-run.");
    process.exit(1);
}
