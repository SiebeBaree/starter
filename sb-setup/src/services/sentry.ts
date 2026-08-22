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

// Org auth tokens (sntrys_) carry a base64 JSON payload between the prefix and the trailing hex secret, with the
// org slug and region URL baked in. Decoding it lets the doctor probe the token against the right silo. Throws on
// anything that is not a well-formed org token.
export function orgTokenPayload(token: string): { org: string; regionUrl: string } {
    const body = token.slice("sntrys_".length);
    const encoded = body.slice(0, body.lastIndexOf("_")).replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(encoded, "base64").toString()) as {
        org?: string;
        region_url?: string;
        url?: string;
    };
    if (!payload.org) throw new Error("org token payload has no org");
    return { org: payload.org, regionUrl: (payload.region_url ?? payload.url ?? "https://sentry.io").replace(/\/+$/, "") };
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
