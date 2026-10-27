import type { CSSProperties } from "react";
import type { CrewRole } from "@/shared/crew";

type CrewRoleTone = "lead" | "builder" | "reviewer" | "scout" | "custom";

export function crewRoleTone(
  role: Pick<CrewRole, "id"> | undefined,
  isLead: boolean,
): CrewRoleTone {
  if (isLead) return "lead";
  if (role?.id === "builder") return "builder";
  if (role?.id === "reviewer") return "reviewer";
  if (role?.id === "scout") return "scout";
  return "custom";
}

function toneStyle(tone: CrewRoleTone): CSSProperties {
  switch (tone) {
    case "builder":
      return {
        color: "var(--project-icon-teal)",
        backgroundColor: "color-mix(in srgb, var(--project-icon-teal) 13%, transparent)",
      };
    case "reviewer":
      return {
        color: "var(--project-icon-pink)",
        backgroundColor: "color-mix(in srgb, var(--project-icon-pink) 13%, transparent)",
      };
    case "scout":
      return {
        color: "var(--project-icon-amber)",
        backgroundColor: "color-mix(in srgb, var(--project-icon-amber) 13%, transparent)",
      };
    case "lead":
      return {
        color: "var(--accent)",
        backgroundColor: "color-mix(in srgb, var(--accent) 13%, transparent)",
      };
    default:
      return { color: "var(--muted)", backgroundColor: "var(--overlay)" };
  }
}

/** The shared role pill: one 20px control matching the roster's row height. */
export function CrewRolePill(props: {
  role?: CrewRole | undefined;
  isLead: boolean;
  leadLabel: string;
  wide?: boolean;
}) {
  const { role, isLead } = props;
  const text = isLead
    ? props.leadLabel
    : role?.parallel && role.parallel > 1
      ? `${role.label} ×${role.parallel}`
      : role?.label;
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center justify-center truncate rounded px-1.5 text-[10px] font-medium leading-5${props.wide === false ? "" : " w-16"}`}
      style={toneStyle(crewRoleTone(role, isLead))}
    >
      {text}
    </span>
  );
}
