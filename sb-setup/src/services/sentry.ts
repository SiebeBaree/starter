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
    return api<{ slug: string; name: string; links?: { regionUrl?: string } }[]>(SERVICE, `${CONTROL_BASE}/organizations/`, {
        headers: bearer(token),
    }).then((list) =>
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

export async function ensureProject(
    token: string,
    regionUrl: string,
    org: string,
    team: string,
    slug: string,
    platform: string,
): Promise<{ dsn: string }> {
    const base = `${regionUrl}/api/0`;
    const existing = await api<{ slug: string }>(SERVICE, `${base}/projects/${org}/${slug}/`, { headers: bearer(token) }, true);
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
