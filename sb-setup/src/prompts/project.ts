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
            options: (Object.keys(TEMPLATES) as TemplateKey[]).map((key) => ({ value: key, label: TEMPLATES[key].label })),
            initialValue: defaults.template,
        }),
    );

    let apiDomain: string | undefined;
    if (template === "react-fastify") {
        apiDomain = must(
            await p.text({
                message: "API domain (without https://)",
                placeholder: "api.example.com",
                validate: (value) =>
                    /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(value ?? "")
                        ? undefined
                        : "Enter a bare domain like api.example.com",
            }),
        );
    }

    return { name, slug, dir, template, apiDomain };
}
