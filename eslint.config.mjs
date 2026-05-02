import js from "@eslint/js"
import tseslint from "typescript-eslint"
import nextPlugin from "@next/eslint-plugin-next"
import reactPlugin from "eslint-plugin-react"
import reactHooksPlugin from "eslint-plugin-react-hooks"

export default tseslint.config(
  // Ignore generated/build artifacts
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "scripts/**",
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // React + React Hooks + Next.js rules
  {
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "@next/next": nextPlugin,
    },
    rules: {
      // React JSX runtime (React 17+ — no need to import React)
      ...reactPlugin.configs["jsx-runtime"].rules,

      // React Hooks — only the classic v4 rules; v7 React-Compiler rules are opt-in
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Disable React Compiler-specific v7 rules (incompatible with existing patterns)
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/globals": "off",
      "react-hooks/refs": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/unsupported-syntax": "off",
      "react-hooks/config": "off",
      "react-hooks/gating": "off",

      // Next.js core web vitals
      ...nextPlugin.configs["core-web-vitals"].rules,

      // Project-specific overrides
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "prefer-const": "error",
      // Non-null assertions used in narrowed predicates (prediction-store.ts)
      "@typescript-eslint/no-non-null-assertion": "off",
    },
    settings: {
      react: { version: "detect" },
    },
  },
)
