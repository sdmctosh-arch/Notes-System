import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia, but theme.js calls it at import
// time (applyTheme(getTheme()) runs once on module load) to pick the
// initial theme, so every test that touches a component tree needs
// this stubbed before that import happens.
window.matchMedia =
  window.matchMedia ||
  function () {
    return {
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  };
