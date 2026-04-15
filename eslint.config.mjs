import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Opt-in strict pass: `YASP_LINT_STRICT=1 npm run lint:strict` layers
// type-aware rules (`no-unsafe-*`) on top of the standard recommended
// config. Kept opt-in because enabling them unconditionally would
// require a large one-shot fallout cleanup across tests and adapters,
// which conflicts with "no flaky gates" — see SECURITY_REMEDIATION_PLAN.md.
const STRICT = process.env.YASP_LINT_STRICT === "1";

const strictTypedConfigs = STRICT
  ? [
      ...tseslint.configs.recommendedTypeChecked,
      {
        files: ["**/*.{ts,tsx,mts,cts}"],
        languageOptions: {
          parserOptions: {
            // `projectService` lets typescript-eslint discover each
            // workspace's tsconfig on demand, so strict-mode runs work
            // across shared/server/client/cdk without wiring a
            // bespoke project glob here.
            projectService: true,
            tsconfigRootDir: import.meta.dirname,
          },
        },
        rules: {
          "@typescript-eslint/no-unsafe-assignment": "error",
          "@typescript-eslint/no-unsafe-call": "error",
          "@typescript-eslint/no-unsafe-argument": "error",
          "@typescript-eslint/no-unsafe-member-access": "error",
          "@typescript-eslint/no-unsafe-return": "error",
        },
      },
    ]
  : [];

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "cdk/cdk.out/**", "tmp/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...strictTypedConfigs,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.es2021,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["client/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ["server/**/*.{ts,tsx}", "shared/**/*.{ts,tsx}", "cdk/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["client/**/*.{tsx,jsx}"],
    plugins: {
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
    },
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  }
);
