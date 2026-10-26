import type { PrAuthor } from "@/shared/contracts";

const SIZE_CLASS = {
  xs: "size-4 text-[9px]",
  sm: "size-5 text-[10px]",
  md: "size-6 text-[11px]",
} as const;

/** Host avatar when the host supplied one, otherwise the login's initial. */
export function PrAvatar(props: { author: PrAuthor; size?: keyof typeof SIZE_CLASS }) {
  const sizeClass = SIZE_CLASS[props.size ?? "sm"];
  return props.author.avatarUrl ? (
    <img
      src={props.author.avatarUrl}
      alt=""
      className={`${sizeClass} shrink-0 rounded-full bg-default-100 object-cover`}
    />
  ) : (
    <span
      aria-hidden
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-default-100 font-semibold uppercase text-foreground`}
    >
      {props.author.login.slice(0, 1)}
    </span>
  );
}
