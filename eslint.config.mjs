import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Next 16 ships its ESLint config as flat config and dropped `next lint`, so
// this is read by the ESLint CLI directly (`npm run lint`, and CI). The two
// imports are what `next/core-web-vitals` and `next/typescript` used to be
// through FlatCompat.
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
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
      // Next 16's plugin brought the React Compiler rules in as errors. They
      // flag 52 places in 25 components written before them: state set inside
      // an effect, a ref read during render, a component defined inside
      // another. Real findings, none of them a bug anyone has seen, and each
      // one a behavioural edit to a checkout or editor component that deserves
      // its own change. Warnings until then, so the report is read rather than
      // silenced. New code is expected to be clean under them.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
    },
  },
];

export default eslintConfig;
