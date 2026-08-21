import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { $ } from "bun";

import type { ProjectAnswers } from "./prompts/project";

// Only touches the target directory and every step is safe to re-run after a failure.
export async function scaffold(answers: ProjectAnswers, templateDir: string): Promise<void> {
    const { dir, name, slug, apiDomain } = answers;

    if (!existsSync(join(dir, "package.json"))) {
        if (existsSync(dir) && readdirSync(dir).length > 0) {
            throw new Error(`${dir} has content but no package.json, refusing to scaffold over it`);
        }
        copyTemplate(templateDir, dir);
    }

    replacePlaceholders(dir, {
        "%APP_NAME%": name,
        "%SLUG_NAME%": slug,
        ...(apiDomain && { "%DOMAIN%": apiDomain }),
    });

    if (!existsSync(join(dir, ".git"))) {
        await $`git -C ${dir} init -b main`.quiet();
        await $`git -C ${dir} add -A`.quiet();
        await $`git -C ${dir} commit -m "chore: scaffold from template"`.quiet();
    }
}

// The templates are working directories, so dependencies, build output and local env files stay behind.
const SKIP_COPY = new Set([
    "node_modules",
    ".git",
    ".DS_Store",
    ".next",
    ".turbo",
    ".react-router",
    "dist",
    "build",
    "coverage",
    "test-results",
    "playwright-report",
]);

function copyTemplate(from: string, to: string): void {
    if (!existsSync(from)) throw new Error(`Template directory ${from} is missing`);
    cpSync(from, to, {
        recursive: true,
        filter: (source) => {
            const base = basename(source);
            return !SKIP_COPY.has(base) && !base.startsWith(".env") && !base.endsWith(".tsbuildinfo");
        },
    });
}

const SKIP_DIRS = new Set(["node_modules", ".git"]);

function replacePlaceholders(root: string, replacements: Record<string, string>): void {
    const entries = Object.entries(replacements);
    const stack = [root];
    while (true) {
        const current = stack.pop();
        if (!current) return;
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const path = join(current, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) stack.push(path);
                continue;
            }
            if (!entry.isFile()) continue;
            const content = readFileSync(path, "utf8");
            if (!entries.some(([token]) => content.includes(token))) continue;
            writeFileSync(
                path,
                entries.reduce((acc, [token, value]) => acc.replaceAll(token, value), content),
            );
        }
    }
}
