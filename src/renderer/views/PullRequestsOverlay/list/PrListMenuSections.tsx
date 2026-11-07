import type { ReactNode } from "react";
import { Dropdown, Label } from "@heroui/react";
import type { Selection } from "@heroui/react";
import { Check } from "lucide-react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { PrLabelChip } from "../parts/PrLabelChip";
import { PrMenuSectionTitle } from "../parts/PrResponsiveMenu";
import {
  activeFilterCount,
  type PrChecksFilter,
  type PrDraftFilter,
  type PrListFilters,
  type PrListSort,
  type PrListState,
  type PrReviewFilter,
} from "./prListModel";

/** Menu key of the "Clear filters" action, shared by every menu that offers it. */
export const CLEAR_FILTERS_ID = "action:clear";

function selected(keys: Selection): string | undefined {
  if (keys === "all") return undefined;
  const key = [...keys][0];
  return key === undefined ? undefined : String(key);
}

function keySet(keys: Selection, all: readonly string[]): Set<string> {
  return keys === "all" ? new Set(all) : new Set([...keys].map(String));
}

/** Projects and accounts are filtered by what is hidden, so a new one starts visible. */
function hiddenFrom(keys: Selection, all: readonly string[]): Set<string> {
  const visible = keySet(keys, all);
  return new Set(all.filter((key) => !visible.has(key)));
}

type Translate = (descriptor: MessageDescriptor) => string;
type Option<T extends string> = { id: T; label: string };

const sortOptions: { id: PrListSort; label: MessageDescriptor }[] = [
  { id: "updated", label: msg`Recently updated` },
  { id: "readiness", label: msg`Merge readiness` },
  { id: "largest", label: msg`Largest` },
  { id: "smallest", label: msg`Smallest` },
];
const stateOptions: { id: PrListState; label: MessageDescriptor }[] = [
  { id: "open", label: msg`Open` },
  { id: "closed", label: msg`Closed` },
  { id: "merged", label: msg`Merged` },
  { id: "all", label: msg`All` },
];
const draftOptions: { id: PrDraftFilter; label: MessageDescriptor }[] = [
  { id: "all", label: msg`All` },
  { id: "only", label: msg`Drafts only` },
  { id: "hide", label: msg`Hide drafts` },
];
const reviewOptions: { id: PrReviewFilter; label: MessageDescriptor }[] = [
  { id: "all", label: msg`All` },
  { id: "approved", label: msg`Approved` },
  { id: "changes", label: msg`Changes requested` },
  { id: "required", label: msg`Review required` },
  { id: "none", label: msg`No reviews` },
];
const checksOptions: { id: PrChecksFilter; label: MessageDescriptor }[] = [
  { id: "all", label: msg`All` },
  { id: "passing", label: msg`Passing` },
  { id: "failing", label: msg`Failing` },
  { id: "pending", label: msg`Running` },
];

function localized<T extends string>(
  options: { id: T; label: MessageDescriptor }[],
  translate: Translate,
): Option<T>[] {
  return options.map((option) => ({ id: option.id, label: translate(option.label) }));
}

/** The choices of each single-select group, shared by the dropdown menus and the compact sheet. */
export const LIST_OPTIONS = {
  sort: (translate: Translate) => localized(sortOptions, translate),
  state: (translate: Translate) => localized(stateOptions, translate),
  drafts: (translate: Translate) => localized(draftOptions, translate),
  review: (translate: Translate) => localized(reviewOptions, translate),
  checks: (translate: Translate) => localized(checksOptions, translate),
};

function sectionKey(section: string, id: string): string {
  return `${section}:${id}`;
}

/** Filters currently narrowing the list: the facet filters plus a non-default state. */
export function filterBadgeCount(state: PrListState, filters: PrListFilters): number {
  return activeFilterCount(filters) + (state !== "open" ? 1 : 0);
}

/**
 * One radio-style group in a menu. A menu's collection keys are global, and the
 * groups share option names ("all"), so every key is namespaced by its section;
 * without that, sections swallow each other's options.
 */
function SingleSection<T extends string>(props: {
  /** Unique within the menu. */
  section: string;
  title: ReactNode;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Dropdown.Section
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[sectionKey(props.section, props.value)]}
      onSelectionChange={(keys) => {
        const key = selected(keys);
        const option = props.options.find(
          (candidate) => sectionKey(props.section, candidate.id) === key,
        );
        if (option) props.onChange(option.id);
      }}
    >
      <PrMenuSectionTitle>{props.title}</PrMenuSectionTitle>
      {props.options.map((option) => (
        <Dropdown.Item
          key={option.id}
          id={sectionKey(props.section, option.id)}
          textValue={option.label}
        >
          <Label className="flex-1 truncate">{option.label}</Label>
          <span className="size-4 shrink-0" aria-hidden>
            {option.id === props.value ? <Check className="size-4" /> : null}
          </span>
        </Dropdown.Item>
      ))}
    </Dropdown.Section>
  );
}

/** The sort options, as a section of any `Dropdown.Menu`. */
export function PrSortSection(props: { value: PrListSort; onChange: (value: PrListSort) => void }) {
  const { i18n } = useLingui();
  const translate: Translate = (descriptor) => i18n._(descriptor);
  return (
    <SingleSection
      section="sort"
      title={<Trans>Sort by</Trans>}
      value={props.value}
      onChange={props.onChange}
      options={LIST_OPTIONS.sort(translate)}
    />
  );
}

export type PrFilterControls = {
  state: PrListState;
  onStateChange: (state: PrListState) => void;
  filters: PrListFilters;
  onFiltersChange: (filters: PrListFilters) => void;
  labels: { name: string; color?: string; count: number }[];
  projects: Project[];
  accounts: [key: string, label: string][];
};

/** Every filter group (state, drafts, review, checks, labels, projects, accounts) as menu sections. */
export function PrFilterSections(props: PrFilterControls) {
  const { i18n } = useLingui();
  const translate: Translate = (descriptor) => i18n._(descriptor);
  const { filters, onFiltersChange } = props;
  return (
    <>
      <SingleSection
        section="state"
        title={<Trans>State</Trans>}
        value={props.state}
        onChange={props.onStateChange}
        options={LIST_OPTIONS.state(translate)}
      />
      <SingleSection<PrDraftFilter>
        section="drafts"
        title={<Trans>Drafts</Trans>}
        value={filters.draft}
        onChange={(draft) => onFiltersChange({ ...filters, draft })}
        options={LIST_OPTIONS.drafts(translate)}
      />
      <SingleSection<PrReviewFilter>
        section="review"
        title={<Trans>Review</Trans>}
        value={filters.review}
        onChange={(review) => onFiltersChange({ ...filters, review })}
        options={LIST_OPTIONS.review(translate)}
      />
      <SingleSection<PrChecksFilter>
        section="checks"
        title={<Trans>Checks</Trans>}
        value={filters.checks}
        onChange={(checks) => onFiltersChange({ ...filters, checks })}
        options={LIST_OPTIONS.checks(translate)}
      />
      {props.labels.length > 0 ? (
        <Dropdown.Section
          selectionMode="multiple"
          selectedKeys={filters.labels}
          onSelectionChange={(keys) =>
            onFiltersChange({
              ...filters,
              labels: keySet(
                keys,
                props.labels.map((label) => label.name),
              ),
            })
          }
        >
          <PrMenuSectionTitle>
            <Trans>Labels</Trans>
          </PrMenuSectionTitle>
          {props.labels.map((label) => (
            <Dropdown.Item key={label.name} id={label.name} textValue={label.name}>
              <PrLabelChip label={label} />
              <span className="ms-auto text-[10px] tabular-nums text-muted">{label.count}</span>
              <span className="size-4 shrink-0" aria-hidden>
                {filters.labels.has(label.name) ? <Check className="size-4" /> : null}
              </span>
            </Dropdown.Item>
          ))}
        </Dropdown.Section>
      ) : null}
      {props.projects.length > 1 ? (
        <Dropdown.Section
          selectionMode="multiple"
          selectedKeys={props.projects
            .map((project) => project.id)
            .filter((id) => !filters.hiddenProjectIds.has(id))}
          onSelectionChange={(keys) =>
            onFiltersChange({
              ...filters,
              hiddenProjectIds: hiddenFrom(
                keys,
                props.projects.map((project) => project.id),
              ),
            })
          }
        >
          <PrMenuSectionTitle>
            <Trans>Projects</Trans>
          </PrMenuSectionTitle>
          {props.projects.map((project) => (
            <Dropdown.Item key={project.id} id={project.id} textValue={project.name}>
              <Label className="flex-1 truncate">{project.name}</Label>
              <span className="size-4 shrink-0" aria-hidden>
                {filters.hiddenProjectIds.has(project.id) ? null : <Check className="size-4" />}
              </span>
            </Dropdown.Item>
          ))}
        </Dropdown.Section>
      ) : null}
      {props.accounts.length > 1 ? (
        <Dropdown.Section
          selectionMode="multiple"
          selectedKeys={props.accounts
            .map(([key]) => key)
            .filter((key) => !filters.hiddenAccounts.has(key))}
          onSelectionChange={(keys) =>
            onFiltersChange({
              ...filters,
              hiddenAccounts: hiddenFrom(
                keys,
                props.accounts.map(([key]) => key),
              ),
            })
          }
        >
          <PrMenuSectionTitle>
            <Trans>Accounts</Trans>
          </PrMenuSectionTitle>
          {props.accounts.map(([key, label]) => (
            <Dropdown.Item key={key} id={key} textValue={label}>
              <Label className="flex-1 truncate">{label}</Label>
              <span className="size-4 shrink-0" aria-hidden>
                {filters.hiddenAccounts.has(key) ? null : <Check className="size-4" />}
              </span>
            </Dropdown.Item>
          ))}
        </Dropdown.Section>
      ) : null}
    </>
  );
}

/** The "Clear filters" row; the owning menu handles it through `onAction` and `disabledKeys`. */
export function PrClearFiltersItem() {
  const { t } = useLingui();
  return (
    <Dropdown.Item id={CLEAR_FILTERS_ID} textValue={t`Clear filters`}>
      <Label>
        <Trans>Clear filters</Trans>
      </Label>
    </Dropdown.Item>
  );
}
