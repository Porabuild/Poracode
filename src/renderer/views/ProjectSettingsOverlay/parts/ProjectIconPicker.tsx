import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { FolderOpen, ImageIcon, Search } from "lucide-react";
import type { Project } from "@/shared/contracts";
import {
  formatFileProjectIcon,
  formatLucideProjectIcon,
  parseProjectIcon,
  projectSupportsFileIcons,
} from "@/shared/projectIcon";
import { IMAGE_EXTENSIONS } from "@/shared/promptContent";
import { getProjectFsPath } from "@/shared/wsl";
import { updateProjectIcon } from "@/renderer/actions/projectActions";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { Button } from "@/renderer/components/common";
import { useProjectIconNode } from "@/renderer/components/common/ProjectIcon";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import { i18n } from "@/renderer/i18n/i18n";
import { projectIconDisplayName, searchProjectIcons } from "@/renderer/utils/projectIcons";
import { focusFirstProjectIcon, ProjectIconGrid } from "./ProjectIconGrid";
import { ProjectIconColorRow, ProjectIconFileGrid } from "./ProjectIconSources";

/** Relative (forward-slash) path of `picked` inside `root`, or null when outside. */
function relativeToProjectRoot(root: string, picked: string): string | null {
  // A stored root can carry a trailing separator; without trimming it the
  // prefix check below never matches and a valid pick reads as "outside".
  const trimmedRoot = root.replace(/[\\/]+$/, "");
  const normalize = (value: string) => value.replaceAll("/", "\\").toLowerCase();
  const normalizedRoot = normalize(trimmedRoot);
  const normalizedPicked = normalize(picked);
  if (!normalizedPicked.startsWith(`${normalizedRoot}\\`)) return null;
  return picked.slice(trimmedRoot.length + 1).replaceAll("\\", "/");
}

export function ProjectIconPicker(props: { project: Project }) {
  const { t } = useLingui();
  const { project } = props;
  const { mobile } = useResponsiveMenu();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const spec = parseProjectIcon(project.icon);
  // File-based icons need the project's folder on this machine: a mirrored
  // project's folder lives on its host, and the PWA bridge has neither the
  // folder probe nor a native file dialog. Bundled glyphs stay available.
  const canUseFileIcons = projectSupportsFileIcons(project) && !isRemoteSession();
  const currentIcon = useProjectIconNode(project, "size-4");
  const searching = search.trim().length > 0;
  const results = searching ? searchProjectIcons(search) : null;
  const [discovered, setDiscovered] = useState<readonly string[]>([]);
  const location = project.location;

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    // On mobile the drawer opens under the on-screen keyboard if we focus the
    // field for them; let the user tap it when they want to filter.
    if (!mobile) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open, mobile]);

  // Probed per opening rather than once, so an icon added to the project while
  // the app is running shows up the next time the picker is opened.
  useEffect(() => {
    if (!open || !canUseFileIcons) return;
    let cancelled = false;
    readBridge()
      .listProjectIconFiles({ projectLocation: location })
      .then((paths) => {
        if (!cancelled) setDiscovered(paths);
      })
      .catch(() => {
        if (!cancelled) setDiscovered([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, canUseFileIcons, location]);

  const apply = (value: string | undefined) => updateProjectIcon(project.id, value);

  const select = (value: string | undefined) => {
    apply(value);
    setOpen(false);
  };

  // Picking a glyph or a colour leaves the popover open: the trigger and every
  // project row update live, so the two choices can be made in one visit.
  const selectGlyph = (name: string) =>
    apply(formatLucideProjectIcon(name, spec?.kind === "lucide" ? spec.color : undefined));
  const selectColor = (color: string | undefined) => {
    if (spec?.kind !== "lucide") return;
    apply(formatLucideProjectIcon(spec.name, color));
  };

  const pickImageFile = async () => {
    const rootPath = getProjectFsPath(project.location);
    if (!rootPath) return;
    const picked = await readBridge().pickFiles({
      title: t`Choose a project icon image`,
      defaultPath: rootPath,
      filters: [{ name: t`Images`, extensions: [...IMAGE_EXTENSIONS] }],
    });
    if (!picked || picked.length === 0) return;
    const relative = relativeToProjectRoot(rootPath, picked[0]!);
    if (!relative) {
      toast.warning(i18n._(msg`Choose an image inside the project folder.`));
      return;
    }
    select(formatFileProjectIcon(relative));
  };

  const triggerLabel = !spec
    ? t`Default`
    : spec.kind === "auto"
      ? t`Automatic`
      : spec.kind === "lucide"
        ? projectIconDisplayName(spec.name)
        : (spec.path.split("/").pop() ?? spec.path);

  return (
    <ResponsiveMenuSurface
      isOpen={open}
      onOpenChange={setOpen}
      label={t`Project icon`}
      placement="bottom end"
      contentClassName="w-[min(360px,calc(100vw-2rem))] p-0"
      dialogClassName="flex max-h-[min(420px,70vh)] flex-col overflow-hidden !p-0"
      trigger={
        <Button
          variant="tertiary"
          aria-label={t`Change project icon`}
          className="w-[240px] shrink-0 justify-start gap-2 font-normal"
          {...(mobile ? { onPress: () => setOpen(true) } : {})}
        >
          {currentIcon ?? <FolderOpen className="size-4 shrink-0 text-muted" />}
          <span className="min-w-0 flex-1 truncate text-left text-xs">{triggerLabel}</span>
        </Button>
      }
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Search className="size-3.5 shrink-0 text-muted" />
        <input
          ref={searchRef}
          aria-label={t`Search icons`}
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          placeholder={t`Search icons...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            // Enter takes the top hit, so a search can be finished without
            // leaving the keyboard or aiming at a 32px cell. Unlike clicking a
            // cell, it commits and closes — it reads as "that one, done".
            if (event.key === "Enter") {
              const first = results?.[0];
              if (!first) return;
              event.preventDefault();
              select(
                formatLucideProjectIcon(first.id, spec?.kind === "lucide" ? spec.color : undefined),
              );
              return;
            }
            if (event.key === "ArrowDown" && focusFirstProjectIcon(gridRef.current)) {
              event.preventDefault();
            }
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {/* The project's own icons lead the catalog: they are the few choices
            specific to this project, and they read as one more icon section. */}
        {!searching && canUseFileIcons && discovered.length > 0 ? (
          <ProjectIconFileGrid
            project={project}
            paths={discovered}
            selectedPath={spec?.kind === "file" ? spec.path : undefined}
            onPick={(path) => select(formatFileProjectIcon(path))}
          />
        ) : null}

        {/* Shown even while searching: picking a glyph from search results is
            the moment a tint is most likely wanted, and the row describes the
            current icon rather than the browse list. */}
        {spec?.kind === "lucide" ? (
          <ProjectIconColorRow selectedColor={spec.color} onPick={selectColor} />
        ) : null}

        {results && results.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted">
            <Trans>No icons found</Trans>
          </div>
        ) : (
          <ProjectIconGrid
            results={results}
            selectedId={spec?.kind === "lucide" ? spec.name : undefined}
            rootRef={gridRef}
            onPick={selectGlyph}
            onExitTop={() => searchRef.current?.focus()}
          />
        )}
      </div>

      <div className="shrink-0 border-t border-border p-2">
        {/* The only way back to no custom icon, so it stays available even
            where file icons cannot resolve (mirrored projects, the PWA). */}
        <Button
          variant="ghost"
          isDisabled={!project.icon}
          className="w-full justify-start gap-2 text-xs font-normal text-muted hover:text-foreground"
          onPress={() => select(undefined)}
        >
          <FolderOpen className="size-4 shrink-0" />
          {t`Location glyph`}
        </Button>
        {canUseFileIcons ? (
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-xs font-normal text-muted hover:text-foreground"
            onPress={() => void pickImageFile()}
          >
            <ImageIcon className="size-4 shrink-0" />
            <Trans>Use an image from the project folder...</Trans>
          </Button>
        ) : null}
      </div>
    </ResponsiveMenuSurface>
  );
}
