import type { ReactElement } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@/renderer/i18n/i18n";

/**
 * Render under test wrapped in an `I18nProvider`, so components using Lingui
 * macros (`<Trans>`, `useLingui`) have an active i18n context. The "en" catalog
 * is loaded + activated by the renderer test setup.
 *
 * Drop-in for Testing Library's `render`; import it as `render` in tests that
 * mount translated components:
 *
 * ```ts
 * import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
 * ```
 */
export function renderWithI18n(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => <I18nProvider i18n={i18n}>{children}</I18nProvider>,
    ...options,
  });
}
