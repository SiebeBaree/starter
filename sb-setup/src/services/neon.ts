import { NEON_REGION } from "../constants";
import { api, ApiError, bearer } from "../http";

const BASE = "https://console.neon.tech/api/v2";
const SERVICE = "Neon";

export function orgs(token: string): Promise<{ id: string; name: string }[]> {
    return api<{ organizations?: { id: string; name: string }[] }>(SERVICE, `${BASE}/users/me/organizations`, {
        headers: bearer(token),
    }).then((r) => r.organizations ?? []);
}

// orgId stays undefined for legacy personal accounts that predate Neon organizations.
export async function ensureProject(
    token: string,
    orgId: string | undefined,
    name: string,
): Promise<{ projectId: string; connectionUri: string }> {
    const query = new URLSearchParams({ search: name, limit: "400" });
    if (orgId) query.set("org_id", orgId);
    const list = await api<{ projects: { id: string; name: string }[] }>(SERVICE, `${BASE}/projects?${query}`, {
        headers: bearer(token),
    });
    let projectId = list.projects.find((project) => project.name === name)?.id;
    if (!projectId) {
        const created = await api<{ project: { id: string } }>(SERVICE, `${BASE}/projects`, {
            method: "POST",
            headers: bearer(token),
            body: { project: { name, region_id: NEON_REGION, ...(orgId && { org_id: orgId }) } },
        });
        projectId = created.project.id;
    }
    return { projectId, connectionUri: await connectionUri(token, projectId) };
}

// The pooled URI suits the serverless driver. Role and database are resolved from the default branch so the same
// path works for freshly created and resumed projects.
async function connectionUri(token: string, projectId: string): Promise<string> {
    const { branches } = await api<{ branches: { id: string; default: boolean }[] }>(
        SERVICE,
        `${BASE}/projects/${projectId}/branches`,
        { headers: bearer(token) },
    );
    const branch = branches.find((b) => b.default) ?? branches[0];
    if (!branch) throw new ApiError(SERVICE, 200, `project ${projectId} has no branches`);
    const [{ roles }, { databases }] = await Promise.all([
        api<{ roles: { name: string; protected: boolean }[] }>(
            SERVICE,
            `${BASE}/projects/${projectId}/branches/${branch.id}/roles`,
            { headers: bearer(token) },
        ),
        api<{ databases: { name: string }[] }>(
            SERVICE,
            `${BASE}/projects/${projectId}/branches/${branch.id}/databases`,
            {
                headers: bearer(token),
            },
        ),
    ]);
    const role = roles.find((r) => !r.protected) ?? roles[0];
    const database = databases[0];
    if (!role || !database)
        throw new ApiError(SERVICE, 200, `project ${projectId} default branch has no role or database`);
    const uriQuery = new URLSearchParams({ role_name: role.name, database_name: database.name, pooled: "true" });
    const { uri } = await api<{ uri: string }>(SERVICE, `${BASE}/projects/${projectId}/connection_uri?${uriQuery}`, {
        headers: bearer(token),
    });
    return uri;
}
