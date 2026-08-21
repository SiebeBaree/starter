// Every service call reports failures the same way: service name, HTTP status and the raw response body.
export class ApiError extends Error {
    constructor(
        readonly service: string,
        readonly status: number,
        readonly body: string,
    ) {
        super(`${service} responded with ${status}`);
    }
}

interface RequestOptions {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    headers: Record<string, string>;
    body?: unknown;
}

export async function api<T>(service: string, url: string, options: RequestOptions): Promise<T>;
export async function api<T>(service: string, url: string, options: RequestOptions, allow404: true): Promise<T | null>;
export async function api<T>(
    service: string,
    url: string,
    options: RequestOptions,
    allow404?: boolean,
): Promise<T | null> {
    const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
            ...(options.body !== undefined && { "Content-Type": "application/json" }),
            ...options.headers,
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    if (response.status === 404 && allow404) return null;
    const text = await response.text();
    if (!response.ok) throw new ApiError(service, response.status, text);
    return text ? (JSON.parse(text) as T) : (undefined as T);
}

export function bearer(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

export function basic(userColonPass: string): Record<string, string> {
    return { Authorization: `Basic ${Buffer.from(userColonPass).toString("base64")}` };
}
