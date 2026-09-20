const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  prettierConfig,
  {
    ignores: ['node_modules/**', 'coverage/**', '.expo/**', 'ios/**', 'android/**'],
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Reanimated's shared values are deliberately mutable handles onto UI-thread
    // state: `x.value = withSpring(0)` IS the library's documented API, and
    // there is no non-mutating alternative. The React Compiler's immutability
    // rule does not model SharedValue, so it flags every correct use.
    //
    // Scoped to the one component that drives animations directly — everywhere
    // else in the app the rule stays on.
    files: ['components/SwipeableCard.tsx'],
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
];
