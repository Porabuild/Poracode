import { Fragment } from "react";
import { getSearchMatchRanges, type SearchQuery } from "@/shared/searchMatching";

export function SearchMatch(props: { text: string; query: SearchQuery; fuzzy?: boolean }) {
  const ranges = getSearchMatchRanges(props.text, props.query, props.fuzzy ?? true);
  if (ranges.length === 0) return props.text;
  const parts = ranges.map((range, index) => {
    const prefix = props.text.slice(index === 0 ? 0 : ranges[index - 1]!.end, range.start);
    return (
      <Fragment key={range.start}>
        {prefix}
        <mark className="rounded-sm bg-accent/15 text-inherit font-semibold">
          {props.text.slice(range.start, range.end)}
        </mark>
      </Fragment>
    );
  });
  return (
    <>
      {parts}
      {props.text.slice(ranges.at(-1)!.end)}
    </>
  );
}
