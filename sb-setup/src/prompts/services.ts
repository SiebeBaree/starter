import * as p from "@clack/prompts";
import type { Defaults } from "../config";
import { SERVICES, type ServiceKey } from "../constants";
import { must } from "./helpers";

export async function askServices(defaults: Defaults): Promise<ServiceKey[]> {
    const keys = Object.keys(SERVICES) as ServiceKey[];
    return must(
        await p.multiselect({
            message: "Services to provision",
            options: keys.map((key) => ({ value: key, label: SERVICES[key] })),
            initialValues: defaults.services?.filter((service) => keys.includes(service)) ?? keys,
            required: false,
        }),
    );
}
