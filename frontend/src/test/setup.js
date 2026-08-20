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

// jsdom doesn't implement scrolling and logs a noisy "not implemented"
// warning on every call - Inbox restores scroll position on mount, so
// this fires in nearly every test that renders it.
window.scrollTo = () => {};
