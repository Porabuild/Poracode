import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Button, Label, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Input } from "@/renderer/components/common";
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
import {
  commitCreateProject,
  commitRemoteCreateProject,
  machinePathLocation,
  resolveMachineHomeLocation,
} from "@/renderer/actions/createProjectActions";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { MachineFolderPicker } from "./MachineFolderPicker";
import { machineConnectionKey, useMachinePlatform, useProjectMachines } from "./projectMachines";
import { ProjectRuntimePicker } from "./ProjectRuntimePicker";

/**
 * Modal for the "New project" flow: name a project, choose a runtime
 * (Local / WSL when distros exist / a reachable paired machine) and a parent
 * folder, then create the new directory there. A paired machine browses its own
 * folders and creates and registers the project itself. "Add folder" does
 * not use this modal.
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
  // Seeded from the mount-time override (or empty until the async home probe
  // below resolves); later runtime/override changes re-seed during render.
  const [defaultDir, setDefaultDir] = useState(() => lastUsedProjectDirs.native ?? "");
  const [dir, setDir] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const choice: RuntimeChoice =
    runtimeKey === "native" ? { kind: "native" } : { kind: "wsl", distro: runtimeKey };
  const machines = useProjectMachines();
  const machineKey = machineConnectionKey(runtimeKey);
  const machinePlatform = useMachinePlatform(machineKey);
  const [machinePickerOpen, setMachinePickerOpen] = useState(false);

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
  // wipe a folder the user already browsed to. Derived state — adjust during
  // render.
  const [prevRuntimeKey, setPrevRuntimeKey] = useState(runtimeKey);
  if (prevRuntimeKey !== runtimeKey) {
    setPrevRuntimeKey(runtimeKey);
    setDir("");
    setSubmitError(null);
  }

  // Resolve the default browse directory (last-used → home) for the runtime.
  // Depend on the resolved per-runtime value, not the whole map, so a
  // new-but-equal map reference doesn't re-run this. Synchronous seeds adjust
  // during render; only the async home-directory probe stays in the effect.
  const lastForRuntime = lastUsedProjectDirs[runtimeKey];
  const [prevDefaultDirKey, setPrevDefaultDirKey] = useState(
    () => `${runtimeKey}\0${lastForRuntime ?? ""}`,
  );
  const defaultDirKey = `${runtimeKey}\0${lastForRuntime ?? ""}`;
  if (prevDefaultDirKey !== defaultDirKey) {
    setPrevDefaultDirKey(defaultDirKey);
    if (lastForRuntime) {
      setDefaultDir(lastForRuntime);
    } else if (runtimeKey !== "native" && !machineKey) {
      setDefaultDir(wslHomeDir(runtimeKey));
    } else {
      setDefaultDir("");
    }
  }
  useEffect(() => {
    const onMachine = machineConnectionKey(runtimeKey);
    if (lastForRuntime || (runtimeKey !== "native" && !onMachine)) {
      return;
    }
    let active = true;
    void (onMachine ? resolveMachineHomeLocation(onMachine) : loadHomeScopeLocation())
      .then((location) => {
        if (active) setDefaultDir(getProjectFsPath(location));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [runtimeKey, lastForRuntime]);

  const scratchParent = dir || defaultDir;
  const scratchKind = machineKey
    ? machinePathLocation(machineKey, scratchParent, machinePlatform).kind
    : scratchKindForChoice(choice, platform);
  const showRuntime = distros.length > 0 || machines.length > 0 || machineKey !== undefined;

  const nameError = validateProjectName(name);
  // A machine's folder browser only returns folders that exist on it, so any
  // chosen folder works; this computer also checks the native/WSL match.
  const parentError = machineKey
    ? scratchParent
      ? null
      : t`Choose a folder…`
    : validateScratchParent(scratchParent, choice);
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
    if (machineKey) {
      setMachinePickerOpen(true);
      return;
    }
    const picked = await readBridge().pickFolder(scratchParent || undefined);
    if (!picked) return;
    setDir(picked);
    setSubmitError(null);
  }

  async function handleSubmit() {
    setBusy(true);
    setSubmitError(null);
    try {
      await (machineKey
        ? commitRemoteCreateProject({ connectionKey: machineKey, parentDir: scratchParent, name })
        : commitCreateProject({ mode: "scratch", choice, dir: scratchParent, name }));
      usePanelStore.getState().closeCreateProjectModal();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t`Couldn't create the project.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal.CloseTrigger />
      <Modal.Header>
        <Modal.Heading>
          <Trans>New project</Trans>
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
          <ProjectRuntimePicker
            runtimeKey={runtimeKey}
            distros={distros}
            machines={machines}
            onChange={setRuntimeKey}
          />
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
      {machinePickerOpen && machineKey ? (
        <MachineFolderPicker
          connectionKey={machineKey}
          initialPath={scratchParent}
          onClose={() => setMachinePickerOpen(false)}
          onSelect={(path) => {
            setDir(path);
            setSubmitError(null);
          }}
        />
      ) : null}
    </>
  );
}
