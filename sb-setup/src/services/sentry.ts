import { api, ApiError, bearer } from "../http";

// Listing orgs is a control-silo endpoint and always lives on sentry.io. Everything org-scoped (teams, projects,
// keys) must go to the org's region silo (EU orgs answer on de.sentry.io and reject sentry.io), so the org list
// carries each org's region URL and the other calls take it as their base.
const CONTROL_BASE = "https://sentry.io/api/0";
const SERVICE = "Sentry";

export interface SentryOrg {
    slug: string;
    name: string;
    regionUrl: string;
}

export function orgs(token: string): Promise<SentryOrg[]> {
    return api<{ slug: string; name: string; links?: { regionUrl?: string } }[]>(
        SERVICE,
        `${CONTROL_BASE}/organizations/`,
        {
            headers: bearer(token),
        },
    ).then((list) =>
        list.map((org) => ({
            slug: org.slug,
            name: org.name,
            regionUrl: (org.links?.regionUrl ?? "https://sentry.io").replace(/\/+$/, ""),
        })),
    );
}

export function teams(token: string, regionUrl: string, org: string): Promise<{ slug: string; name: string }[]> {
    return api<{ slug: string; name: string }[]>(SERVICE, `${regionUrl}/api/0/organizations/${org}/teams/`, {
        headers: bearer(token),
    });
}

// Org auth tokens (sntrys_) are the CI-safe kind: scoped to source map upload and release creation, no account
// access. The token value is only returned at creation, so a re-run rotates the token instead of reusing it; the
// fresh value is re-uploaded to Vercel right after. Needs org:write on the user token.
export async function ensureOrgToken(token: string, regionUrl: string, org: string, name: string): Promise<string> {
    const base = `${regionUrl}/api/0/organizations/${org}/org-auth-tokens/`;
    const existing = await api<{ id: string; name: string }[]>(SERVICE, base, { headers: bearer(token) });
    await Promise.all(
        existing
            .filter((t) => t.name === name)
            .map((stale) => api(SERVICE, `${base}${stale.id}/`, { method: "DELETE", headers: bearer(token) })),
    );
    const created = await api<{ token: string }>(SERVICE, base, {
        method: "POST",
        headers: bearer(token),
        body: { name },
    });
    return created.token;
}

export async function ensureProject(
    token: string,
    regionUrl: string,
    org: string,
    team: string,
    slug: string,
    platform: string,
): Promise<{ dsn: string }> {
    const base = `${regionUrl}/api/0`;
    const existing = await api<{ slug: string }>(
        SERVICE,
        `${base}/projects/${org}/${slug}/`,
        { headers: bearer(token) },
        true,
    );
    if (!existing) {
        await api(SERVICE, `${base}/teams/${org}/${team}/projects/`, {
            method: "POST",
            headers: bearer(token),
            body: { name: slug, slug, platform },
        });
    }
    const keys = await api<{ dsn: { public: string } }[]>(SERVICE, `${base}/projects/${org}/${slug}/keys/`, {
        headers: bearer(token),
    });
    const key =
        keys[0] ??
        (await api<{ dsn: { public: string } }>(SERVICE, `${base}/projects/${org}/${slug}/keys/`, {
            method: "POST",
            headers: bearer(token),
            body: { name: "default" },
        }));
    if (!key) throw new ApiError(SERVICE, 200, `project ${slug} has no client keys`);
    return { dsn: key.dsn.public };
}
