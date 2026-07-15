import { useEffect, useState } from "react";
import { ChevronDown, FolderOpen, Monitor } from "lucide-react";
import { Button, Dropdown, Label, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Input, TuxIcon } from "@/renderer/components/common";
import {
  buildScratchTargetPath,
  scratchKindForChoice,
  splitPathLeaf,
  validateProjectName,
  validateScratchParent,
  wslHomeDir,
  type RuntimeChoice,
} from "@/shared/createProject";
import { getProjectFsPath } from "@/shared/wsl";
import { readBridge } from "@/renderer/bridge";
import { loadHomeScopeLocation } from "@/renderer/actions/projectActions";
import { commitCreateProject } from "@/renderer/actions/createProjectActions";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

/**
 * Modal for the "Start from scratch" flow: name a project, choose a runtime
 * (Native / WSL when distros exist) and a parent folder, then create the new
 * directory on disk. "Use an existing folder" does not use this modal — it goes
 * straight to the system folder picker.
 */
export function CreateProjectModal() {
  const open = usePanelStore((s) => s.createProjectModalOpen);

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) usePanelStore.getState().closeCreateProjectModal();
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[540px]">
          {open ? <CreateProjectForm /> : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function CreateProjectForm() {
  const { t } = useLingui();
  const platform = readBridge().platform;
  const lastUsedProjectDirs = useSharedSettings((s) => s.lastUsedProjectDirs);

  const [distros, setDistros] = useState<string[]>([]);
  const [runtimeKey, setRuntimeKey] = useState("native");
  const [defaultDir, setDefaultDir] = useState("");
  const [dir, setDir] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const choice: RuntimeChoice =
    runtimeKey === "native" ? { kind: "native" } : { kind: "wsl", distro: runtimeKey };

  useEffect(() => {
    let active = true;
    void readBridge()
      .listWslDistros()
      .then((list) => {
        if (active) setDistros(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Switching runtime clears the user's pick. Keyed only on `runtimeKey` so an
  // unrelated change to the settings object's identity (e.g. hydration) can't
  // wipe a folder the user already browsed to.
  useEffect(() => {
    setDir("");
    setSubmitError(null);
  }, [runtimeKey]);

  // Resolve the default browse directory (last-used → home) for the runtime.
  // Depend on the resolved per-runtime value, not the whole map, so a
  // new-but-equal map reference doesn't re-run this.
  const lastForRuntime = lastUsedProjectDirs[runtimeKey];
  useEffect(() => {
    let active = true;
    if (lastForRuntime) {
      setDefaultDir(lastForRuntime);
      return;
    }
    if (runtimeKey !== "native") {
      setDefaultDir(wslHomeDir(runtimeKey));
      return;
    }
    setDefaultDir("");
    void loadHomeScopeLocation()
      .then((location) => {
        if (active) setDefaultDir(getProjectFsPath(location));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [runtimeKey, lastForRuntime]);

  const scratchParent = dir || defaultDir;
  const scratchKind = scratchKindForChoice(choice, platform);
  const showRuntime = distros.length > 0;

  const nameError = validateProjectName(name);
  const parentError = validateScratchParent(scratchParent, choice);
  const validationError = nameError ?? parentError;
  // Only surface a runtime/path *mismatch* inline (not the "nothing picked yet"
  // case, which would flash an error while the home dir is still resolving).
  const parentMismatch = scratchParent ? parentError : null;
  const inlineError = submitError ?? parentMismatch;

  // Show the full target path right in the picker (no separate preview line, so
  // the body height stays stable). Append the leaf only once the name is valid
  // and the parent matches the runtime; otherwise show the parent alone.
  const pickerPath =
    scratchParent && !nameError && !parentMismatch && name.trim()
      ? buildScratchTargetPath(scratchParent, name.trim(), scratchKind)
      : scratchParent;
  // Split for middle-ellipsis display so the leaf stays visible (see picker below).
  const pickerLeaf = pickerPath ? splitPathLeaf(pickerPath) : null;

  async function handleBrowse() {
    const picked = await readBridge().pickFolder(scratchParent || undefined);
    if (!picked) return;
    setDir(picked);
    setSubmitError(null);
  }

  async function handleSubmit() {
    setBusy(true);
    setSubmitError(null);
    try {
      await commitCreateProject({ mode: "scratch", choice, dir: scratchParent, name });
      usePanelStore.getState().closeCreateProjectModal();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t`Couldn't create the project.`);
    } finally {
      setBusy(false);
    }
  }

  const runtimeLabel = runtimeKey === "native" ? t`Native` : runtimeKey;

  return (
    <>
      <Modal.CloseTrigger />
      <Modal.Header>
        <Modal.Heading>
          <Trans>Start from scratch</Trans>
        </Modal.Heading>
        <p className="mt-1 text-xs text-muted">
          <Trans>Name your project and choose where to create it.</Trans>
        </p>
      </Modal.Header>
      <Modal.Body className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted">
            <Trans>Project name</Trans>
          </Label>
          <Input
            aria-label={t`Project name`}
            placeholder={t`New project`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !validationError && !busy) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
          />
        </div>

        {showRuntime ? (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted">
              <Trans>Runtime</Trans>
            </Label>
            <Dropdown>
              <Button aria-label={t`Runtime`} variant="tertiary" className="justify-between">
                <span className="flex items-center gap-2">
                  {runtimeKey === "native" ? (
                    <Monitor className="size-4 text-muted" />
                  ) : (
                    <TuxIcon className="size-4 text-muted" />
                  )}
                  {runtimeLabel}
                </span>
                <ChevronDown className="size-3.5 text-muted/60" />
              </Button>
              <Dropdown.Popover className="min-w-[--trigger-width]">
                <Dropdown.Menu
                  aria-label={t`Runtime options`}
                  selectionMode="single"
                  selectedKeys={[runtimeKey]}
                  onAction={(key) => setRuntimeKey(String(key))}
                >
                  <Dropdown.Item id="native" textValue={t`Native`}>
                    <Monitor className="size-4 shrink-0 text-muted" />
                    <Label>
                      <Trans>Native</Trans>
                    </Label>
                  </Dropdown.Item>
                  {distros.map((distro) => (
                    <Dropdown.Item key={distro} id={distro} textValue={distro}>
                      <TuxIcon className="size-4 shrink-0 text-muted" />
                      <Label>{distro}</Label>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted">
            <Trans>Location</Trans>
          </Label>
          <Button
            aria-label={t`Browse for parent folder`}
            variant="tertiary"
            className="w-full justify-start gap-2 font-normal"
            onPress={() => void handleBrowse()}
          >
            <FolderOpen className="size-4 shrink-0 text-muted" />
            {pickerLeaf ? (
              // Middle-ellipsis: head truncates with `…`, the leaf stays pinned, so
              // a long path never pushes the button past the modal width.
              <span className="flex min-w-0 flex-1 items-center text-left">
                <span className="truncate">{pickerLeaf.head}</span>
                <span className="shrink-0">{pickerLeaf.tail}</span>
              </span>
            ) : (
              <span className="flex-1 text-left text-muted">
                <Trans>Choose a folder…</Trans>
              </span>
            )}
          </Button>
        </div>

        {inlineError ? <p className="text-xs text-danger">{inlineError}</p> : null}
      </Modal.Body>
      <Modal.Footer>
        <Button slot="close" variant="ghost" className="text-muted">
          <Trans>Cancel</Trans>
        </Button>
        <Button
          variant="tertiary"
          isDisabled={!!validationError || busy}
          isPending={busy}
          onPress={() => void handleSubmit()}
        >
          <Trans>Create project</Trans>
        </Button>
      </Modal.Footer>
    </>
  );
}
