// Tailwind 4 currently emits only the WebKit alias for backdrop-filter in
// authored CSS. Keep both declarations so Chromium/Edge and iOS Safari render
// the same glass material in both Next.js dev and production builds.
const restoreBackdropFilter = () => ({
  postcssPlugin: "rulequant-restore-backdrop-filter",
  OnceExit(root) {
    root.walkDecls("-webkit-backdrop-filter", (declaration) => {
      const next = declaration.next();
      if (next?.prop === "backdrop-filter" && next.value === declaration.value) return;
      declaration.cloneAfter({ prop: "backdrop-filter" });
    });
  },
});

restoreBackdropFilter.postcss = true;

module.exports = restoreBackdropFilter;
