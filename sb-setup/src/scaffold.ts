import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import type { ProjectAnswers } from "./prompts/project";

// Only touches the target directory and every step is safe to re-run after a failure.
export async function scaffold(answers: ProjectAnswers, templateRepo: string, githubToken?: string): Promise<void> {
    const { dir, name, slug, apiDomain } = answers;

    if (!existsSync(join(dir, "package.json"))) {
        if (existsSync(dir) && readdirSync(dir).length > 0) {
            throw new Error(`${dir} has content but no package.json, refusing to scaffold over it`);
        }
        // The token also grants read access to private template repos.
        const cloneUrl = githubToken ? templateRepo.replace("https://", `https://x-access-token:${githubToken}@`) : templateRepo;
        await $`git clone --depth 1 ${cloneUrl} ${dir}`.quiet();
        await $`rm -rf ${join(dir, ".git")}`.quiet();
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
