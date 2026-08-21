import { requireToken, type Credentials, type Defaults } from "../config";
import type { ServiceKey } from "../constants";
import * as axiom from "../services/axiom";
import * as github from "../services/github";
import * as neon from "../services/neon";
import * as posthog from "../services/posthog";
import * as sentry from "../services/sentry";
import * as vercel from "../services/vercel";
import { pickOne, withSpinner } from "./helpers";

export interface Destinations {
    githubOwner: string;
    githubOwnerIsOrg: boolean;
    vercelTeamId: string | null;
    neonOrgId?: string;
    axiomOrgId?: string;
    posthogOrgId?: string;
    sentryOrg?: string;
    sentryRegionUrl?: string;
    sentryTeam?: string;
}

export async function askDestinations(
    creds: Credentials,
    services: ServiceKey[],
    defaults: Defaults,
): Promise<Destinations> {
    const has = (service: ServiceKey) => services.includes(service);

    const ghToken = requireToken(creds, "github");
    const [ghUser, ghOrgs] = await withSpinner("Fetching GitHub owners", () =>
        Promise.all([github.me(ghToken), github.orgs(ghToken)]),
    );
    const githubOwner = await pickOne(
        "GitHub owner",
        [
            { value: ghUser.login, label: `${ghUser.login} (personal)` },
            ...ghOrgs.map((org) => ({ value: org.login, label: org.login })),
        ],
        defaults.githubOwner,
    );

    const vercelToken = requireToken(creds, "vercel");
    const [vercelUser, vercelTeams] = await withSpinner("Fetching Vercel teams", () =>
        Promise.all([vercel.user(vercelToken), vercel.teams(vercelToken)]),
    );
    const pickedTeam = await pickOne(
        "Vercel team",
        [
            { value: "", label: `${vercelUser.username} (personal)` },
            ...vercelTeams.map((team) => ({ value: team.id, label: team.name })),
        ],
        defaults.vercelTeam,
    );

    const destinations: Destinations = {
        githubOwner,
        githubOwnerIsOrg: githubOwner !== ghUser.login,
        vercelTeamId: pickedTeam === "" ? null : pickedTeam,
    };

    if (has("neon")) {
        const orgs = await withSpinner("Fetching Neon orgs", () => neon.orgs(requireToken(creds, "neon")));
        // No orgs means a legacy personal account, projects are created without an org id.
        if (orgs.length > 0) {
            destinations.neonOrgId = await pickOne(
                "Neon org",
                orgs.map((org) => ({ value: org.id, label: org.name })),
                defaults.neonOrg,
            );
        }
    }

    if (has("axiom")) {
        const orgs = await withSpinner("Fetching Axiom orgs", () => axiom.orgs(requireToken(creds, "axiom")));
        if (orgs.length > 0) {
            destinations.axiomOrgId = await pickOne(
                "Axiom org",
                orgs.map((org) => ({ value: org.id, label: org.name })),
                defaults.axiomOrg,
            );
        }
    }

    if (has("posthog")) {
        const orgs = await withSpinner("Fetching PostHog orgs", () => posthog.orgs(requireToken(creds, "posthog")));
        destinations.posthogOrgId = await pickOne(
            "PostHog org",
            orgs.map((org) => ({ value: org.id, label: org.name })),
            defaults.posthogOrg,
        );
    }

    if (has("sentry")) {
        const sentryToken = requireToken(creds, "sentry");
        const orgs = await withSpinner("Fetching Sentry orgs", () => sentry.orgs(sentryToken));
        destinations.sentryOrg = await pickOne(
            "Sentry org",
            orgs.map((org) => ({ value: org.slug, label: org.name })),
            defaults.sentryOrg,
        );
        const org = destinations.sentryOrg;
        destinations.sentryRegionUrl = orgs.find((o) => o.slug === org)?.regionUrl ?? "https://sentry.io";
        const regionUrl = destinations.sentryRegionUrl;
        const teams = await withSpinner("Fetching Sentry teams", () => sentry.teams(sentryToken, regionUrl, org));
        destinations.sentryTeam = await pickOne(
            "Sentry team",
            teams.map((team) => ({ value: team.slug, label: team.name })),
            defaults.sentryTeam,
        );
    }

    return destinations;
}
