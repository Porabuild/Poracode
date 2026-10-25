import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import type { PrMenuItem, PrMenuSection } from "../parts/PrResponsiveMenu";
import { LIST_OPTIONS, type PrFilterControls } from "./PrListMenuSections";
import type { PrListSort } from "./prListModel";

function single<T extends string>(
  id: string,
  title: string,
  options: { id: T; label: string }[],
  value: T,
  onChange: (value: T) => void,
): PrMenuSection {
  return {
    id,
    title,
    items: options.map((option) => ({
      id: `${id}:${option.id}`,
      label: option.label,
      checked: option.id === value,
      onSelect: () => onChange(option.id),
    })),
  };
}

function toggled(set: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}

/**
 * The list's sort and filter choices as sheet rows, the compact counterpart of the
 * dropdown sections in `PrListMenuSections`: the same options and the same state
 * changes, drawn as single-choice groups and multi-select groups with check marks.
 */
export function usePrListSheetSections(input: {
  sort: PrListSort;
  onSortChange: (sort: PrListSort) => void;
  controls: PrFilterControls;
  canClear: boolean;
  onClear: () => void;
}): PrMenuSection[] {
  const { t, i18n } = useLingui();
  const translate = (descriptor: MessageDescriptor) => i18n._(descriptor);
  const { controls } = input;
  const { filters, onFiltersChange } = controls;
  const multi = (
    id: string,
    title: string,
    items: { key: string; label: string; checked: boolean; toggle: () => void }[],
  ): PrMenuSection => ({
    id,
    title,
    items: items.map((item): PrMenuItem => ({
      id: `${id}:${item.key}`,
      label: item.label,
      checked: item.checked,
      keepOpen: true,
      onSelect: item.toggle,
    })),
  });
  return [
    single("sort", t`Sort by`, LIST_OPTIONS.sort(translate), input.sort, input.onSortChange),
    single(
      "state",
      t`State`,
      LIST_OPTIONS.state(translate),
      controls.state,
      controls.onStateChange,
    ),
    single("drafts", t`Drafts`, LIST_OPTIONS.drafts(translate), filters.draft, (draft) =>
      onFiltersChange({ ...filters, draft }),
    ),
    single("review", t`Review`, LIST_OPTIONS.review(translate), filters.review, (review) =>
      onFiltersChange({ ...filters, review }),
    ),
    single("checks", t`Checks`, LIST_OPTIONS.checks(translate), filters.checks, (checks) =>
      onFiltersChange({ ...filters, checks }),
    ),
    multi(
      "labels",
      t`Labels`,
      controls.labels.map((label) => ({
        key: label.name,
        label: label.name,
        checked: filters.labels.has(label.name),
        toggle: () => onFiltersChange({ ...filters, labels: toggled(filters.labels, label.name) }),
      })),
    ),
    multi(
      "projects",
      t`Projects`,
      controls.projects.length > 1
        ? controls.projects.map((project) => ({
            key: project.id,
            label: project.name,
            checked: !filters.hiddenProjectIds.has(project.id),
            toggle: () =>
              onFiltersChange({
                ...filters,
                hiddenProjectIds: toggled(filters.hiddenProjectIds, project.id),
              }),
          }))
        : [],
    ),
    multi(
      "accounts",
      t`Accounts`,
      controls.accounts.length > 1
        ? controls.accounts.map(([key, label]) => ({
            key,
            label,
            checked: !filters.hiddenAccounts.has(key),
            toggle: () =>
              onFiltersChange({
                ...filters,
                hiddenAccounts: toggled(filters.hiddenAccounts, key),
              }),
          }))
        : [],
    ),
    {
      id: "clear",
      items: [
        {
          id: "action:clear",
          label: t`Clear filters`,
          disabled: !input.canClear,
          onSelect: input.onClear,
        },
      ],
    },
  ];
}
