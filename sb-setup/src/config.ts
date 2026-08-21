import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ServiceKey, TemplateKey, TokenKey } from "./constants";

export const CREDENTIALS_PATH = join(homedir(), ".config", "sb-setup", "credentials.json");
const DEFAULTS_PATH = join(homedir(), ".config", "sb-setup", "defaults.json");

export type Credentials = Partial<Record<TokenKey, string>>;

// Answers cached from the previous run and preselected on the next one.
export interface Defaults {
    template?: TemplateKey;
    services?: ServiceKey[];
    githubOwner?: string;
    vercelTeam?: string;
    neonOrg?: string;
    axiomOrg?: string;
    posthogOrg?: string;
    sentryOrg?: string;
    sentryTeam?: string;
}

function readJson<T>(path: string): T | undefined {
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf8")) as T;
}

// Creates an empty credentials file (chmod 600) on first run so there is an obvious place to paste tokens.
export function loadCredentials(): Credentials {
    const existing = readJson<Credentials>(CREDENTIALS_PATH);
    if (existing) return existing;
    mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true });
    writeFileSync(CREDENTIALS_PATH, "{}\n", { mode: 0o600 });
    return {};
}

// The doctor guarantees tokens exist before provisioning starts, so a miss here is a programming error.
export function requireToken(creds: Credentials, key: TokenKey): string {
    const value = creds[key];
    if (!value) throw new Error(`Missing ${key} token, the doctor should have caught this`);
    return value;
}

export function loadDefaults(): Defaults {
    return readJson<Defaults>(DEFAULTS_PATH) ?? {};
}

export function saveDefaults(defaults: Defaults): void {
    mkdirSync(dirname(DEFAULTS_PATH), { recursive: true });
    writeFileSync(DEFAULTS_PATH, `${JSON.stringify(defaults, null, 4)}\n`);
}
