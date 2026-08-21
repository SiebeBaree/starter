import { UPSTASH_PRIMARY_REGION } from "../constants";
import { api, ApiError, basic } from "../http";

const BASE = "https://api.upstash.com/v2";
const SERVICE = "Upstash";

interface Database {
    database_id: string;
    database_name: string;
    endpoint: string;
    rest_token?: string;
}

export async function ensureDatabase(token: string, name: string): Promise<{ restUrl: string; restToken: string }> {
    const list = await api<Database[]>(SERVICE, `${BASE}/redis/databases`, { headers: basic(token) });
    let database = list.find((db) => db.database_name === name);
    database ??= await api<Database>(SERVICE, `${BASE}/redis/database`, {
        method: "POST",
        headers: basic(token),
        body: { database_name: name, region: "global", platform: "aws", primary_region: UPSTASH_PRIMARY_REGION, tls: true },
    });
    // The list response omits credentials, the details response carries rest_token.
    const details = await api<Database>(SERVICE, `${BASE}/redis/database/${database.database_id}`, { headers: basic(token) });
    const restToken = details.rest_token ?? database.rest_token;
    if (!restToken) throw new ApiError(SERVICE, 200, `database ${name} details did not include a rest_token field`);
    const host = details.endpoint.includes(".") ? details.endpoint : `${details.endpoint}.upstash.io`;
    return { restUrl: `https://${host}`, restToken };
}
