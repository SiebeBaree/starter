import { VERCEL_FUNCTION_REGION } from "../constants";
import { api, ApiError, bearer } from "../http";

const BASE = "https://api.vercel.com";
const SERVICE = "Vercel";

function url(path: string, teamId: string | null, params: Record<string, string> = {}): string {
    const u = new URL(BASE + path);
    if (teamId) u.searchParams.set("teamId", teamId);
    for (const [key, value] of Object.entries(params)) u.searchParams.set(key, value);
    return u.toString();
}

export function user(token: string): Promise<{ username: string }> {
    return api<{ user: { username: string } }>(SERVICE, `${BASE}/v2/user`, { headers: bearer(token) }).then((r) => r.user);
}

export function teams(token: string): Promise<{ id: string; name: string }[]> {
    return api<{ teams: { id: string; name: string }[] }>(SERVICE, `${BASE}/v2/teams`, { headers: bearer(token) }).then(
        (r) => r.teams,
    );
}

export interface ProjectSpec {
    name: string;
    framework: string | null;
    rootDirectory: string | null;
    repo: string;
}

export interface Project {
    id: string;
    name: string;
}

export async function ensureProject(token: string, teamId: string | null, spec: ProjectSpec): Promise<Project> {
    const existing = await api<Project>(SERVICE, url(`/v9/projects/${spec.name}`, teamId), { headers: bearer(token) }, true);
    if (existing) return existing;
    const body = {
        name: spec.name,
        framework: spec.framework,
        rootDirectory: spec.rootDirectory,
        serverlessFunctionRegion: VERCEL_FUNCTION_REGION,
        gitRepository: { type: "github", repo: spec.repo },
    };
    try {
        return await api<Project>(SERVICE, url("/v10/projects", teamId), { method: "POST", headers: bearer(token), body });
    } catch (error) {
        // Framework slugs come and go; "Other" still builds through the package.json scripts.
        if (error instanceof ApiError && error.status === 400 && spec.framework !== null) {
            return api<Project>(SERVICE, url("/v10/projects", teamId), {
                method: "POST",
                headers: bearer(token),
                body: { ...body, framework: null },
            });
        }
        throw error;
    }
}

export interface EnvVar {
    key: string;
    value: string;
    target?: ("production" | "preview" | "development")[];
}

export async function upsertEnv(token: string, teamId: string | null, projectId: string, vars: EnvVar[]): Promise<void> {
    if (vars.length === 0) return;
    await api(SERVICE, url(`/v10/projects/${projectId}/env`, teamId, { upsert: "true" }), {
        method: "POST",
        headers: bearer(token),
        body: vars.map((v) => ({ key: v.key, value: v.value, type: "encrypted", target: v.target ?? ["production", "preview"] })),
    });
}

export async function deployFromGit(token: string, teamId: string | null, projectName: string, repoId: number): Promise<string> {
    const deployment = await api<{ url: string }>(SERVICE, url("/v13/deployments", teamId), {
        method: "POST",
        headers: bearer(token),
        body: { name: projectName, target: "production", gitSource: { type: "github", repoId, ref: "main" } },
    });
    return `https://${deployment.url}`;
}
