import * as p from "@clack/prompts";

// Unwraps a clack prompt result, exiting cleanly when the user hits ctrl-c.
export function must<T>(result: T | symbol): T {
    if (p.isCancel(result)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }
    return result as T;
}

export interface Choice {
    value: string;
    label: string;
}

// One option picks itself silently, more than one prompts with the cached choice preselected.
export async function pickOne(message: string, options: Choice[], cached?: string): Promise<string> {
    if (options.length === 0) throw new Error(`No options available for: ${message}`);
    const only = options[0];
    if (options.length === 1 && only) return only.value;
    const initialValue = options.some((option) => option.value === cached) ? cached : undefined;
    return must(await p.select({ message, options, initialValue }));
}

export async function withSpinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const spinner = p.spinner();
    spinner.start(label);
    try {
        const result = await fn();
        spinner.stop(label);
        return result;
    } catch (error) {
        spinner.stop(`${label} failed`, 1);
        throw error;
    }
}
