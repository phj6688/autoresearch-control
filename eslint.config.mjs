import nextConfig from "eslint-config-next";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  ...nextConfig,
  {
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  {
    ignores: ["node_modules/", ".next/"],
  },
];
