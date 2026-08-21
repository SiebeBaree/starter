import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/server.ts"],
    format: "esm",
    clean: true,
    // Workspace packages ship TS source, so they must be bundled rather than left as externals.
    noExternal: [/^@repo\//],
});
