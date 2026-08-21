import { api, bearer } from "../http";

const BASE = "https://api.github.com";
const SERVICE = "GitHub";

function headers(token: string): Record<string, string> {
    return { ...bearer(token), Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
}

export interface GithubUser {
    login: string;
}

export function me(token: string): Promise<GithubUser> {
    return api<GithubUser>(SERVICE, `${BASE}/user`, { headers: headers(token) });
}

export function orgs(token: string): Promise<GithubUser[]> {
    return api<GithubUser[]>(SERVICE, `${BASE}/user/orgs?per_page=100`, { headers: headers(token) });
}

export interface Repo {
    id: number;
    full_name: string;
    html_url: string;
}

export async function ensureRepo(token: string, owner: string, ownerIsOrg: boolean, name: string): Promise<Repo> {
    const existing = await api<Repo>(SERVICE, `${BASE}/repos/${owner}/${name}`, { headers: headers(token) }, true);
    if (existing) return existing;
    const createUrl = ownerIsOrg ? `${BASE}/orgs/${owner}/repos` : `${BASE}/user/repos`;
    return api<Repo>(SERVICE, createUrl, { method: "POST", headers: headers(token), body: { name, private: true } });
}

// The token travels in the one-off push URL only, the stored origin remote stays clean.
export function pushUrl(token: string, fullName: string): string {
    return `https://x-access-token:${token}@github.com/${fullName}.git`;
}
