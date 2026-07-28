import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const terminalSource = readFileSync(
  resolve(process.cwd(), "src/components/rulequant-terminal.tsx"),
  "utf8",
);
const styles = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

describe("mobile more navigation", () => {
  it("renders the sheet in a body portal above its backdrop", () => {
    expect(terminalSource).toContain("createPortal(");
    expect(terminalSource).toContain("document.body");
    expect(terminalSource).toContain('className="rq-mobile-more-layer lg:hidden"');
    expect(terminalSource).toContain('aria-modal="true"');
    expect(styles).toContain(".rq-mobile-more-layer");
    expect(styles).toContain("z-index: 100");
  });

  it("does not use the page-level pseudo overlay for the mobile sheet", () => {
    expect(styles).not.toContain("body:has(.rq-mobile-nav.is-more-open)::after");
    expect(styles).toContain(".rq-mobile-more-backdrop");
  });
});
