import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { requireToken, type Credentials } from "./config";
import { TEMPLATES, type ServiceKey } from "./constants";
import type { Destinations } from "./prompts/destinations";
import { withSpinner } from "./prompts/helpers";
import type { ProjectAnswers } from "./prompts/project";
import { scaffold } from "./scaffold";
import * as axiom from "./services/axiom";
import * as github from "./services/github";
import * as neon from "./services/neon";
import * as posthog from "./services/posthog";
import * as sentry from "./services/sentry";
import * as upstash from "./services/upstash";
import * as vercel from "./services/vercel";

export interface ProvisionInput {
    creds: Credentials;
    answers: ProjectAnswers;
    services: ServiceKey[];
    dest: Destinations;
}

function need<T>(value: T | undefined, what: string): T {
    if (value === undefined) throw new Error(`Missing ${what}`);
    return value;
}

// Runs every step in order and returns summary lines for the outro. Each step is idempotent (find before create),
// so a failed run can be re-run with the same answers and resumes where it stopped.
export async function provision(input: ProvisionInput): Promise<string[]> {
    const { creds, answers, services, dest } = input;
    const { name, slug, dir, template, apiDomain } = answers;
    const has = (service: ServiceKey) => services.includes(service);
    const summary: string[] = [];

    await withSpinner("Scaffolding template", () => scaffold(answers, TEMPLATES[template].repo, creds.github));
    await withSpinner("Installing dependencies", async () => {
        await $`pnpm install`.cwd(dir).quiet();
    });

    const ghToken = requireToken(creds, "github");
    const repo = await withSpinner("Creating GitHub repo", () =>
        github.ensureRepo(ghToken, dest.githubOwner, dest.githubOwnerIsOrg, slug),
    );
    await withSpinner("Pushing to GitHub", async () => {
        const remotes = (await $`git -C ${dir} remote`.text()).split("\n");
        if (!remotes.includes("origin")) {
            await $`git -C ${dir} remote add origin ${`git@github.com:${repo.full_name}.git`}`.quiet();
        }
        await $`git -C ${dir} push ${github.pushUrl(ghToken, repo.full_name)} HEAD:main`.quiet();
    });
    summary.push(`Repo: ${repo.html_url}`);

    let databaseUrl: string | undefined;
    if (has("neon")) {
        const project = await withSpinner("Provisioning Neon Postgres", () =>
            neon.ensureProject(requireToken(creds, "neon"), dest.neonOrgId, slug),
        );
        const url = project.connectionUri;
        databaseUrl = url;
        await withSpinner("Running database migrations", async () => {
            const env = { ...process.env, DATABASE_URL: url };
            if (template === "next") await $`pnpm db:migrate`.cwd(dir).env(env).quiet();
            else await $`pnpm --filter @repo/db db:migrate`.cwd(dir).env(env).quiet();
        });
        // Local dev reads .env. Written after the scaffold commit and gitignored by the templates, so it never lands in git.
        const envPath = template === "next" ? join(dir, ".env") : join(dir, "apps", "api", ".env");
        writeFileSync(envPath, `DATABASE_URL=${url}\n`);
    }

    let redis: { restUrl: string; restToken: string } | undefined;
    if (has("upstash")) {
        redis = await withSpinner("Provisioning Upstash Redis", () =>
            upstash.ensureDatabase(requireToken(creds, "upstash"), slug),
        );
    }

    let axiomIngest: { token: string; dataset: string } | undefined;
    if (has("axiom")) {
        const axiomToken = requireToken(creds, "axiom");
        await withSpinner("Provisioning Axiom dataset", () => axiom.ensureDataset(axiomToken, dest.axiomOrgId, slug));
        if (template === "next") {
            const ingestToken = await withSpinner("Creating Axiom ingest token", () =>
                axiom.ensureIngestToken(axiomToken, dest.axiomOrgId, slug, `${slug}-ingest`),
            );
            axiomIngest = { token: ingestToken, dataset: slug };
        } else {
            // The api logs plain JSON to stdout; shipping happens through Vercel's Axiom log drain integration.
            summary.push(`Axiom: dataset "${slug}" created, connect the Vercel log drain to it manually`);
        }
    }

    let posthogKey: string | undefined;
    if (has("posthog")) {
        const project = await withSpinner("Provisioning PostHog project", () =>
            posthog.ensureProject(requireToken(creds, "posthog"), need(dest.posthogOrgId, "PostHog org"), name),
        );
        posthogKey = project.apiKey;
    }

    let appDsn: string | undefined;
    let webDsn: string | undefined;
    let apiDsn: string | undefined;
    if (has("sentry")) {
        const sentryToken = requireToken(creds, "sentry");
        const org = need(dest.sentryOrg, "Sentry org");
        const regionUrl = need(dest.sentryRegionUrl, "Sentry region");
        const team = need(dest.sentryTeam, "Sentry team");
        if (template === "next") {
            appDsn = (
                await withSpinner("Provisioning Sentry project", () =>
                    sentry.ensureProject(sentryToken, regionUrl, org, team, slug, "javascript-nextjs"),
                )
            ).dsn;
        } else {
            webDsn = (
                await withSpinner("Provisioning Sentry project (web)", () =>
                    sentry.ensureProject(sentryToken, regionUrl, org, team, `${slug}-web`, "javascript-react"),
                )
            ).dsn;
            apiDsn = (
                await withSpinner("Provisioning Sentry project (api)", () =>
                    sentry.ensureProject(sentryToken, regionUrl, org, team, `${slug}-api`, "node"),
                )
            ).dsn;
        }
    }

    const vercelToken = requireToken(creds, "vercel");
    const teamId = dest.vercelTeamId;

    if (template === "next") {
        const project = await withSpinner("Creating Vercel project", () =>
            vercel.ensureProject(vercelToken, teamId, {
                name: slug,
                framework: "nextjs",
                rootDirectory: null,
                repo: repo.full_name,
            }),
        );
        const prodUrl = `https://${slug}.vercel.app`;
        const envs: vercel.EnvVar[] = [{ key: "APP_URL", value: prodUrl }];
        if (databaseUrl) envs.push({ key: "DATABASE_URL", value: databaseUrl });
        if (redis) {
            envs.push(
                { key: "UPSTASH_REDIS_REST_URL", value: redis.restUrl },
                { key: "UPSTASH_REDIS_REST_TOKEN", value: redis.restToken },
            );
        }
        if (axiomIngest) {
            envs.push({ key: "AXIOM_TOKEN", value: axiomIngest.token }, { key: "AXIOM_DATASET", value: axiomIngest.dataset });
        }
        if (posthogKey) envs.push({ key: "NEXT_PUBLIC_POSTHOG_KEY", value: posthogKey });
        if (appDsn) {
            envs.push(
                { key: "NEXT_PUBLIC_SENTRY_DSN", value: appDsn },
                // Source map upload at build time runs on the same personal auth token.
                { key: "SENTRY_ORG", value: need(dest.sentryOrg, "Sentry org") },
                { key: "SENTRY_PROJECT", value: slug },
                { key: "SENTRY_AUTH_TOKEN", value: requireToken(creds, "sentry") },
            );
        }
        await withSpinner("Setting Vercel env vars", () => vercel.upsertEnv(vercelToken, teamId, project.id, envs));
        const deploymentUrl = await withSpinner("Deploying to Vercel", () =>
            vercel.deployFromGit(vercelToken, teamId, slug, repo.id),
        );
        summary.push(`App: ${prodUrl}`, `Deployment: ${deploymentUrl}`);
    } else {
        const webName = `${slug}-web`;
        const apiName = `${slug}-api`;
        const webProject = await withSpinner("Creating Vercel project (web)", () =>
            vercel.ensureProject(vercelToken, teamId, {
                name: webName,
                // The template's vercel.json carries the output directory, "Other" builds through package.json.
                framework: null,
                rootDirectory: "apps/web",
                repo: repo.full_name,
            }),
        );
        const apiProject = await withSpinner("Creating Vercel project (api)", () =>
            vercel.ensureProject(vercelToken, teamId, {
                name: apiName,
                framework: "fastify",
                rootDirectory: "apps/api",
                repo: repo.full_name,
            }),
        );

        const webUrl = `https://${webName}.vercel.app`;
        const domain = need(apiDomain, "API domain");
        const apiEnvs: vercel.EnvVar[] = [{ key: "CORS_ORIGIN", value: webUrl }];
        if (databaseUrl) apiEnvs.push({ key: "DATABASE_URL", value: databaseUrl });
        if (redis) {
            apiEnvs.push(
                { key: "UPSTASH_REDIS_REST_URL", value: redis.restUrl },
                { key: "UPSTASH_REDIS_REST_TOKEN", value: redis.restToken },
            );
        }
        if (apiDsn) apiEnvs.push({ key: "SENTRY_DSN", value: apiDsn });

        const webEnvs: vercel.EnvVar[] = [{ key: "VITE_API_URL", value: `https://${domain}` }];
        if (posthogKey) webEnvs.push({ key: "VITE_POSTHOG_KEY", value: posthogKey });
        if (webDsn) webEnvs.push({ key: "VITE_SENTRY_DSN", value: webDsn });

        await withSpinner("Setting Vercel env vars", async () => {
            await vercel.upsertEnv(vercelToken, teamId, apiProject.id, apiEnvs);
            await vercel.upsertEnv(vercelToken, teamId, webProject.id, webEnvs);
        });
        const apiDeployment = await withSpinner("Deploying api", () =>
            vercel.deployFromGit(vercelToken, teamId, apiName, repo.id),
        );
        const webDeployment = await withSpinner("Deploying web", () =>
            vercel.deployFromGit(vercelToken, teamId, webName, repo.id),
        );
        summary.push(
            `Web: ${webUrl} (deployment ${webDeployment})`,
            `API: https://${apiName}.vercel.app (deployment ${apiDeployment})`,
            `Attach ${domain} to the ${apiName} Vercel project, the web bundle and CSP already point at it`,
            `CORS_ORIGIN is ${webUrl}, update it when the web app gets its real domain`,
        );
    }

    summary.push(`Local: ${dir}`);
    return summary;
}
