import {
  Briefcase,
  Building2,
  Code2,
  Gamepad2,
  Globe2,
  GraduationCap,
  Heart,
  Lightbulb,
  Music2,
  Palette,
  Rocket,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import type { WorkspaceIconId } from "@/shared/contracts";

const WORKSPACE_ICONS: Record<WorkspaceIconId, LucideIcon> = {
  briefcase: Briefcase,
  rocket: Rocket,
  palette: Palette,
  code: Code2,
  building: Building2,
  graduation: GraduationCap,
  heart: Heart,
  sprout: Sprout,
  globe: Globe2,
  lightbulb: Lightbulb,
  music: Music2,
  gamepad: Gamepad2,
};

export function WorkspaceIcon(props: { icon: WorkspaceIconId; className?: string }) {
  const Icon = WORKSPACE_ICONS[props.icon];
  return <Icon aria-hidden className={props.className} />;
}
