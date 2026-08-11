import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Supabase writes its edge-runtime bundle here when the local stack
      // starts. Git ignores it; ESLint has no idea git exists, so `npm run
      // lint` was reporting 154 errors in one generated file nobody wrote —
      // which is how a lint report stops being read.
      "supabase/.temp/**",
    ],
  },
  {
    rules: {
      // A leading underscore is how this codebase already says "this argument
      // exists to hold a position I am not using" — a mock that must match a
      // signature, a destructure that skips a field. The linter did not know
      // that, so a dozen deliberate placeholders were reported as oversights
      // and the report stopped being read. Named here, the convention means
      // something and everything left in the list is a real finding.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // A disable comment that suppresses nothing is worse than no comment: it
      // reads as "this was considered" while the warning fires two lines down,
      // which is exactly what had happened in components/oto/shell.tsx.
      "no-unused-disable": "off",
    },
  },
];

export default eslintConfig;
