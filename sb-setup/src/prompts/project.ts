import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import * as p from "@clack/prompts";

import type { Defaults } from "../config";
import { TEMPLATES, type TemplateKey } from "../constants";
import { must } from "./helpers";

export interface ProjectAnswers {
    name: string;
    slug: string;
    dir: string;
    template: TemplateKey;
    appDomain?: string;
    webDomain?: string;
    apiDomain?: string;
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export async function askProject(defaults: Defaults): Promise<ProjectAnswers> {
    const name = must(
        await p.text({
            message: "Project name",
            validate: (value) => (value?.trim() ? undefined : "Give the project a name"),
        }),
    ).trim();

    const slug = must(
        await p.text({
            message: "Slug",
            initialValue: slugify(name),
            validate: (value) =>
                /^[a-z][a-z0-9-]*$/.test(value ?? "")
                    ? undefined
                    : "Lowercase letters, digits and hyphens, starting with a letter",
        }),
    );

    const dir = resolve(must(await p.text({ message: "Install location", initialValue: `./${slug}` })));
    if (existsSync(dir) && readdirSync(dir).length > 0) {
        const proceed = must(await p.confirm({ message: `${dir} is not empty. Use it anyway?`, initialValue: false }));
        if (!proceed) {
            p.cancel("Pick another location and re-run.");
            process.exit(0);
        }
    }

    const template = must(
        await p.select({
            message: "Template",
            options: (Object.keys(TEMPLATES) as TemplateKey[]).map((key) => ({
                value: key,
                label: TEMPLATES[key].label,
            })),
            initialValue: defaults.template,
        }),
    );

    // The real domains go into APP_URL, CORS_ORIGIN and VITE_API_URL. The auto-assigned vercel.app urls are never
    // what a project actually runs on, so the CLI asks instead of assuming <slug>.vercel.app is free and used.
    if (template === "next") {
        return { name, slug, dir, template, appDomain: await askDomain("App domain (without https://)") };
    }
    return {
        name,
        slug,
        dir,
        template,
        webDomain: await askDomain("Web domain (without https://)"),
        apiDomain: await askDomain("API domain (without https://)", "api.example.com"),
    };
}

async function askDomain(message: string, placeholder = "app.example.com"): Promise<string> {
    return must(
        await p.text({
            message,
            placeholder,
            validate: (value) =>
                /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(value ?? "")
                    ? undefined
                    : `Enter a bare domain like ${placeholder}`,
        }),
    );
}
