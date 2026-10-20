import { Button, Checkbox, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { evaluateNativeVisualValue } from "@/shared/nativeVisuals";
import type { NativeVisualLeafBlock, NativeVisualTabs } from "@/shared/nativeVisualsV2";
import type {
  NativeVisualChartView,
  NativeVisualTableView,
  NativeVisualUiEntry,
} from "@/renderer/state/nativeVisualUiStore";
import { NativeVisualChart } from "./NativeVisualChart";
import { NativeVisualDiagram } from "./NativeVisualDiagram";
import { NativeVisualTable, formatNativeVisualNumber } from "./NativeVisualTable";

export type NativeVisualInteractions = Pick<
  NativeVisualUiEntry,
  "checked" | "tabs" | "charts" | "tables"
>;

export function NativeVisualBlocks({
  blocks,
  inputs,
  entry,
  layout = "stack",
  onChange,
}: {
  blocks: (NativeVisualLeafBlock | NativeVisualTabs)[];
  inputs: ReadonlyMap<string, number>;
  entry: NativeVisualUiEntry | undefined;
  layout?: "stack" | "dashboard";
  onChange: (patch: NativeVisualInteractions) => void;
}) {
  const { t, i18n } = useLingui();
  const checked = new Map(entry?.checked);
  const tabs = new Map(entry?.tabs);
  const charts = new Map(entry?.charts);
  const tables = new Map(entry?.tables);
  function tableView(path: string): NativeVisualTableView {
    return tables.get(path) ?? { query: "" };
  }
  function changeTable(path: string, view: NativeVisualTableView) {
    onChange({ tables: [...new Map(tables).set(path, view)] });
  }
  function renderBlock(block: NativeVisualLeafBlock | NativeVisualTabs, path: string) {
    const chart: NativeVisualChartView = charts.get(path) ?? {
      hiddenSeries: [],
      point: 0,
      showTable: false,
    };
    return (
      <section
        key={path}
        className="min-w-0 space-y-3"
        style={
          layout === "dashboard" && block.type !== "text" && block.type !== "checklist"
            ? { gridColumn: "1 / -1" }
            : undefined
        }
      >
        {block.title ? <h3 className="text-sm font-medium">{block.title}</h3> : null}
        {block.type === "chart" ? (
          <NativeVisualChart
            block={block}
            inputs={inputs}
            view={chart}
            onViewChange={(view) => onChange({ charts: [...new Map(charts).set(path, view)] })}
            tableView={tableView(path)}
            onTableViewChange={(view) => changeTable(path, view)}
          />
        ) : block.type === "table" ? (
          <NativeVisualTable
            block={block}
            inputs={inputs}
            view={tableView(path)}
            onViewChange={(view) => changeTable(path, view)}
          />
        ) : block.type === "outputs" ? (
          <dl
            className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-3"
            aria-live="polite"
          >
            {block.items.map((item, index) => (
              <div
                key={index}
                className="rounded-lg border border-border bg-foreground/[0.025] p-3"
              >
                <dt className="text-xs text-muted">{item.label}</dt>
                <dd className="mt-1 break-words text-2xl font-semibold tracking-tight tabular-nums">
                  {formatNativeVisualNumber(
                    evaluateNativeVisualValue(item.value, inputs),
                    item.format,
                    i18n.locale,
                    t`Unavailable`,
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : block.type === "text" ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">
            {block.text}
          </p>
        ) : block.type === "checklist" ? (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span role="status" className="text-xs text-muted tabular-nums">
                {t`Completed: ${block.items.filter((item) => checked.get(`${path}/${item.id}`) ?? item.checked ?? false).length} / ${block.items.length}`}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onPress={() =>
                  onChange({ checked: [...checked].filter(([key]) => !key.startsWith(`${path}/`)) })
                }
              >{t`Reset checklist`}</Button>
            </div>
            <div className="flex flex-col gap-3">
              {block.items.map((item) => {
                const key = `${path}/${item.id}`;
                return (
                  <Checkbox
                    key={item.id}
                    variant="secondary"
                    isSelected={checked.get(key) ?? item.checked ?? false}
                    onChange={(value) =>
                      onChange({ checked: [...new Map(checked).set(key, value)] })
                    }
                  >
                    <Checkbox.Content className="items-start">
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <span className="min-w-0 whitespace-pre-wrap break-words text-sm">
                        {item.label}
                      </span>
                    </Checkbox.Content>
                  </Checkbox>
                );
              })}
            </div>
          </div>
        ) : block.type === "diagram" ? (
          <NativeVisualDiagram block={block} />
        ) : (
          <Tabs
            variant="secondary"
            selectedKey={
              block.tabs.some((tab) => tab.id === tabs.get(path))
                ? tabs.get(path)!
                : block.tabs[0]!.id
            }
            onSelectionChange={(key) =>
              onChange({ tabs: [...new Map(tabs).set(path, String(key))] })
            }
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label={block.title || t`Visual sections`}>
                {block.tabs.map((tab) => (
                  <Tabs.Tab key={tab.id} id={tab.id}>
                    {tab.label}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
            {block.tabs.map((tab) => (
              <Tabs.Panel key={tab.id} id={tab.id} className="min-w-0 space-y-5 pt-4">
                {tab.blocks.map((child, index) => renderBlock(child, `${path}/${tab.id}/${index}`))}
              </Tabs.Panel>
            ))}
          </Tabs>
        )}
      </section>
    );
  }
  return (
    <div
      className="grid min-w-0 gap-5"
      style={{
        gridTemplateColumns:
          layout === "dashboard" ? "repeat(auto-fit,minmax(min(100%,320px),1fr))" : "minmax(0,1fr)",
      }}
    >
      {blocks.map((block, index) => renderBlock(block, String(index)))}
    </div>
  );
}
