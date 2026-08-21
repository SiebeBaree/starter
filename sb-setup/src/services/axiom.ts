import { api, bearer } from "../http";

const BASE = "https://api.axiom.co/v2";
const SERVICE = "Axiom";

// Personal tokens need the org header, org API tokens ignore it.
function headers(token: string, orgId?: string): Record<string, string> {
    return { ...bearer(token), ...(orgId && { "x-axiom-org-id": orgId }) };
}

export function orgs(token: string): Promise<{ id: string; name: string }[]> {
    return api<{ id: string; name: string }[]>(SERVICE, `${BASE}/orgs`, { headers: bearer(token) });
}

export async function ensureDataset(token: string, orgId: string | undefined, name: string): Promise<void> {
    const list = await api<{ name: string }[]>(SERVICE, `${BASE}/datasets`, { headers: headers(token, orgId) });
    if (list.some((dataset) => dataset.name === name)) return;
    await api(SERVICE, `${BASE}/datasets`, {
        method: "POST",
        headers: headers(token, orgId),
        body: { name, description: "Created by sb-setup" },
    });
}

// Token values are only readable at creation time, so a leftover same-name token from a failed run is replaced.
export async function ensureIngestToken(
    token: string,
    orgId: string | undefined,
    dataset: string,
    name: string,
): Promise<string> {
    const existing = await api<{ id: string; name: string }[]>(SERVICE, `${BASE}/tokens`, { headers: headers(token, orgId) });
    const stale = existing.find((t) => t.name === name);
    if (stale) {
        await api(SERVICE, `${BASE}/tokens/${stale.id}`, { method: "DELETE", headers: headers(token, orgId) });
    }
    const created = await api<{ token: string }>(SERVICE, `${BASE}/tokens`, {
        method: "POST",
        headers: headers(token, orgId),
        body: {
            name,
            description: "Created by sb-setup",
            orgCapabilities: {},
            datasetCapabilities: { [dataset]: { ingest: ["create"] } },
        },
    });
    return created.token;
}
