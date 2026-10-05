import { Check, TriangleAlert } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ThemeDocument } from "@/shared/customThemes";
import { TEXT_CONTRAST_MINIMUM, themeTextContrast } from "@/renderer/theme/themeContrast";

export function CustomThemeContrast(props: { theme: ThemeDocument }) {
  const { t } = useLingui();
  const light = themeTextContrast(props.theme.light, "light");
  const dark = themeTextContrast(props.theme.dark, "dark");
  const rows = [
    { key: "content", label: t`Content background` },
    { key: "muted", label: t`Secondary text` },
    { key: "surface", label: t`Surface` },
    { key: "sidebar", label: t`Sidebar background` },
    { key: "composer", label: t`Composer background` },
    { key: "sidebarRowActive", label: t`Selected sidebar row` },
    { key: "accent", label: t`Text on accent` },
  ] as const;
  return (
    <div className="space-y-1">
      <table className="w-full text-xs">
        <caption className="mb-1 text-left font-medium text-foreground">
          <Trans>Text contrast</Trans>
        </caption>
        <thead>
          <tr className="text-muted">
            <th scope="col" className="text-left font-normal">
              <Trans>Surface</Trans>
            </th>
            <th scope="col" className="text-right font-normal">
              <Trans>Light</Trans>
            </th>
            <th scope="col" className="text-right font-normal">
              <Trans>Dark</Trans>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label }) => (
            <tr key={key}>
              <th scope="row" className="py-1 text-left font-normal text-muted">
                {label}
              </th>
              <td className="text-right">
                <ContrastRatio value={light[key]} />
              </td>
              <td className="text-right">
                <ContrastRatio value={dark[key]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted">
        <Trans>— means an automatic fill or an invalid color.</Trans>
      </p>
      <p className="text-xs text-muted">
        <Trans>Ratios for opaque theme surfaces. Aim for at least 4.5:1 for text.</Trans>
      </p>
    </div>
  );
}

function ContrastRatio(props: { value: number | null }) {
  if (props.value === null) return <span className="text-muted">—</span>;
  const good = props.value >= TEXT_CONTRAST_MINIMUM;
  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums ${good ? "text-success" : "text-warning"}`}
    >
      {good ? (
        <Check className="size-3" aria-hidden />
      ) : (
        <TriangleAlert className="size-3" aria-hidden />
      )}
      {props.value.toFixed(2)}:1
      <span className="sr-only">
        {good ? <Trans>Good contrast</Trans> : <Trans>Low contrast</Trans>}
      </span>
    </span>
  );
}
