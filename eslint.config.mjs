import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  // The system handle bypasses row-level security. CLAUDE.md lists who may hold it.
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: [
      "app/api/webhook/**",
      "app/api/jobs/**",
      "app/api/runner/**",
      "app/api/mcp/**",
      "app/admin/**",
      "app/api/admin/**",
      "lib/jobs/**",
      "lib/db/**",
      "lib/auth.ts",
      "lib/**/*.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/lib/db", importNames: ["asSystem"], message: "asSystem is for webhooks, jobs, runner endpoints and sign-in only." },
            { name: "@/lib/db/client", importNames: ["asSystem"], message: "asSystem is for webhooks, jobs, runner endpoints and sign-in only." },
          ],
        },
      ],
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".source/**",
  ]),
]);

export default eslintConfig;
