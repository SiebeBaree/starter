import { POSTHOG_HOST } from "../constants";
import { api, bearer } from "../http";

const SERVICE = "PostHog";

export function orgs(token: string): Promise<{ id: string; name: string }[]> {
    return api<{ results: { id: string; name: string }[] }>(SERVICE, `${POSTHOG_HOST}/api/organizations/`, {
        headers: bearer(token),
    }).then((r) => r.results);
}

interface Project {
    id: number;
    name: string;
    api_token?: string;
}

export async function ensureProject(token: string, orgId: string, name: string): Promise<{ apiKey: string }> {
    const list = await api<{ results: Project[] }>(SERVICE, `${POSTHOG_HOST}/api/organizations/${orgId}/projects/?limit=500`, {
        headers: bearer(token),
    });
    const existing = list.results.find((project) => project.name === name);
    if (existing?.api_token) return { apiKey: existing.api_token };
    if (existing) {
        const detail = await api<{ api_token: string }>(SERVICE, `${POSTHOG_HOST}/api/projects/${existing.id}/`, {
            headers: bearer(token),
        });
        return { apiKey: detail.api_token };
    }
    const created = await api<{ api_token: string }>(SERVICE, `${POSTHOG_HOST}/api/organizations/${orgId}/projects/`, {
        method: "POST",
        headers: bearer(token),
        body: { name },
    });
    return { apiKey: created.api_token };
}
