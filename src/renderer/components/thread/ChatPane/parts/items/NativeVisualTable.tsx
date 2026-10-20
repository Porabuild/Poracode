import { SearchField, Table } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  evaluateNativeVisualValue,
  type NativeVisualFormat,
  type NativeVisualTable as TableSpec,
} from "@/shared/nativeVisuals";
import type { NativeVisualTableView } from "@/renderer/state/nativeVisualUiStore";
import { CopyTextButton } from "./CopyTextButton";

export function formatNativeVisualNumber(
  value: number | null,
  format: NativeVisualFormat | undefined,
  locale: string,
  unavailable: string,
): string {
  if (value === null) return unavailable;
  return new Intl.NumberFormat(
    locale,
    format ?? { style: "decimal", maximumFractionDigits: 2 },
  ).format(value);
}

export function NativeVisualTable({
  block,
  inputs,
  view,
  onViewChange,
}: {
  block: TableSpec;
  inputs: ReadonlyMap<string, number>;
  view: NativeVisualTableView;
  onViewChange: (view: NativeVisualTableView) => void;
}) {
  const { t, i18n } = useLingui();
  const unavailable = t`Unavailable`;
  const query = view.query.trim().toLocaleLowerCase(i18n.locale);
  const rows = block.rows
    .map((row, index) => {
      const cells = row.map((value) =>
        typeof value === "string" ? value : evaluateNativeVisualValue(value, inputs),
      );
      return {
        index,
        cells,
        formatted: cells.map((value, column) =>
          typeof value === "string"
            ? value
            : formatNativeVisualNumber(
                value,
                block.columns[column]!.format,
                i18n.locale,
                unavailable,
              ),
        ),
      };
    })
    .filter((row) =>
      row.formatted.some((value) => value.toLocaleLowerCase(i18n.locale).includes(query)),
    );
  const sort = view.sort && view.sort.column < block.columns.length ? view.sort : undefined;
  if (sort) {
    const { column, direction } = sort;
    const collator = new Intl.Collator(i18n.locale, { numeric: true, sensitivity: "base" });
    rows.sort((a, b) => {
      const first = a.cells[column]!;
      const second = b.cells[column]!;
      if (first === null || second === null)
        return first === second ? a.index - b.index : first === null ? 1 : -1;
      let compared: number;
      if (typeof first === "number") {
        if (typeof second !== "number") return -1;
        compared = first - second;
      } else {
        if (typeof second === "number") return 1;
        compared = collator.compare(first, second);
      }
      return (direction === "descending" ? -compared : compared) || a.index - b.index;
    });
  }
  const copiedTable = [block.columns.map((column) => column.label), ...rows.map((row) => row.cells)]
    .map((row) =>
      row
        .map((value) => {
          let text = value === null ? unavailable : String(value);
          if (typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/.test(text)) text = "'" + text;
          return /[\t\r\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
        })
        .join("\t"),
    )
    .join("\n");
  return (
    <div className="min-w-0 space-y-2">
      {block.rows.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <SearchField
            aria-label={t`Filter table`}
            value={view.query}
            onChange={(nextQuery) => onViewChange({ ...view, query: nextQuery.slice(0, 200) })}
            variant="secondary"
            className="min-w-0 flex-1 basis-40"
          >
            <SearchField.Group className="h-8 min-h-8">
              <SearchField.SearchIcon className="size-3.5 text-muted" />
              <SearchField.Input
                placeholder={t`Filter table`}
                maxLength={200}
                className="min-w-0 text-xs"
              />
              <SearchField.ClearButton aria-label={t`Clear filter`} />
            </SearchField.Group>
          </SearchField>
          <span role="status" className="text-xs text-muted tabular-nums">
            {t`Rows: ${rows.length} / ${block.rows.length}`}
          </span>
          {rows.length ? <CopyTextButton text={copiedTable} label={t`Copy table`} /> : null}
        </div>
      ) : null}
      <Table variant="secondary">
        <Table.ScrollContainer>
          <Table.Content
            aria-label={block.title || t`Data table`}
            {...(sort
              ? { sortDescriptor: { column: `column-${sort.column}`, direction: sort.direction } }
              : {})}
            onSortChange={(descriptor) =>
              onViewChange({
                ...view,
                sort: {
                  column: Number(String(descriptor.column).slice(7)),
                  direction: descriptor.direction,
                },
              })
            }
          >
            <Table.Header>
              {block.columns.map((column, index) => (
                <Table.Column
                  key={`column-${index}`}
                  id={`column-${index}`}
                  isRowHeader={index === 0}
                  allowsSorting
                  className="whitespace-nowrap text-xs"
                >
                  {({ sortDirection }) => (
                    <Table.SortableColumnHeader {...(sortDirection ? { sortDirection } : {})}>
                      {column.label}
                    </Table.SortableColumnHeader>
                  )}
                </Table.Column>
              ))}
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <span className="text-xs text-muted">
                  {view.query ? t`No matching rows` : t`No data`}
                </span>
              )}
            >
              {rows.map((row) => (
                <Table.Row key={`row-${row.index}`} id={`row-${row.index}`}>
                  {row.cells.map((value, columnIndex) => (
                    <Table.Cell
                      key={columnIndex}
                      className={
                        typeof value === "string"
                          ? "max-w-80 whitespace-pre-wrap break-words text-xs"
                          : "whitespace-nowrap text-right text-xs tabular-nums"
                      }
                    >
                      {row.formatted[columnIndex]}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}
