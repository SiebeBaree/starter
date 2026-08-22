#!/usr/bin/env bun
import * as p from "@clack/prompts";

import { loadCredentials, loadDefaults, saveDefaults } from "./src/config";
import { SERVICES, TEMPLATES } from "./src/constants";
import { assertTokens, runDoctor } from "./src/doctor";
import { ApiError } from "./src/http";
import { askDestinations } from "./src/prompts/destinations";
import { must } from "./src/prompts/helpers";
import { askProject } from "./src/prompts/project";
import { askServices } from "./src/prompts/services";
import { provision } from "./src/provision";

async function main(): Promise<void> {
    p.intro("sb-setup");

    const creds = loadCredentials();
    const report = await runDoctor(creds);

    let defaults = loadDefaults();
    if (process.argv.includes("--fresh")) {
        defaults = {};
    } else if (Object.keys(defaults).length > 0) {
        const useCache = must(await p.confirm({ message: "Prefill answers from your last run?", initialValue: true }));
        if (!useCache) defaults = {};
    }

    const answers = await askProject(defaults);
    const services = await askServices(defaults);
    // Both templates require DATABASE_URL at boot and the Upstash vars in production, so skipping these two does
    // not produce a leaner deploy, it produces one that fails env validation until the vars are set by hand.
    const required = (["neon", "upstash"] as const).filter((service) => !services.includes(service));
    if (required.length > 0) {
        p.log.warn(
            `Without ${required.map((s) => SERVICES[s]).join(" and ")} the deploy fails env validation. ` +
                "The templates hard-require those vars, so only skip this if you bring your own and set them on Vercel yourself.",
        );
    }
    // The Next.js template uploads source maps at build time, which needs the org token on top of the user token.
    const sentryKeys = services.includes("sentry") && answers.template === "next" ? (["sentryCi"] as const) : [];
    assertTokens(["github", "vercel", ...services, ...sentryKeys], report);
    const dest = await askDestinations(creds, services, defaults);

    // Merge over the previous cache so orgs of deselected services survive for the next run.
    saveDefaults({
        ...loadDefaults(),
        template: answers.template,
        services,
        githubOwner: dest.githubOwner,
        vercelTeam: dest.vercelTeamId ?? "",
        ...(dest.neonOrgId && { neonOrg: dest.neonOrgId }),
        ...(dest.axiomOrgId && { axiomOrg: dest.axiomOrgId }),
        ...(dest.posthogOrgId && { posthogOrg: dest.posthogOrgId }),
        ...(dest.sentryOrg && { sentryOrg: dest.sentryOrg }),
        ...(dest.sentryTeam && { sentryTeam: dest.sentryTeam }),
    });

    p.note(
        [
            `Template:  ${TEMPLATES[answers.template].label}`,
            `Directory: ${answers.dir}`,
            `GitHub:    ${dest.githubOwner}/${answers.slug} (private)`,
            `Services:  ${services.length > 0 ? services.map((s) => SERVICES[s]).join(", ") : "none"}`,
        ].join("\n"),
        "Plan",
    );
    const go = must(await p.confirm({ message: "Create the repo, provision services and deploy?" }));
    if (!go) {
        p.cancel("Nothing was created.");
        process.exit(0);
    }

    const summary = await provision({ creds, answers, services, dest });
    p.note(summary.join("\n"), "Done");
    p.outro(`cd ${answers.dir}`);
}

main().catch((error: unknown) => {
    if (error instanceof ApiError) {
        p.log.error(`${error.service} API error ${error.status}:\n${error.body}`);
    } else if (error && typeof error === "object" && "stderr" in error) {
        // Bun.$ shell failure, stderr carries the useful part.
        p.log.error(String((error as { stderr: unknown }).stderr));
    } else {
        p.log.error(error instanceof Error ? error.message : String(error));
    }
    p.log.warn(
        "Nothing outside the target directory was touched. Re-run with the same answers to resume, finished resources are reused.",
    );
    process.exit(1);
});
