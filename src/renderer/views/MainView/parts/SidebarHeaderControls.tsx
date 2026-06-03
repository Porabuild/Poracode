import { startTransition, useState } from "react";
import { FolderPlus, Globe, Monitor, Search, Server } from "lucide-react";
import { Button, Dropdown, Label, Modal, Tooltip } from "@heroui/react";
import { Input, TuxIcon } from "@/renderer/components/common";
import { parseSshProjectSpec } from "@/shared/ssh";
import { parseWslUncPath } from "@/shared/wsl";
import { isWindows, readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  type ThreadSortMode,
  sortModeOrder,
  sortModeIcon,
  sortModeLabel,
} from "@/renderer/views/MainView/parts/Sidebar/parts/sortMode";
import { autoDetectSetupScript } from "@/renderer/utils/gitHelpers";

export function SidebarHeaderControls(props: { wslAvailable: boolean }) {
  const { wslAvailable } = props;
  const addProject = useAppStore((state) => state.addProject);
  const openDraft = useAppStore((state) => state.openDraft);
  const threadSortMode = usePanelStore((s) => s.threadSortMode);
  const browserPanelOpen = usePanelStore((s) => s.browserPanelOpen);
  const rightPanelTab = usePanelStore((s) => s.rightPanelTab);
  const browserVisible = browserPanelOpen && rightPanelTab === "browser";
  const [sshDialogOpen, setSshDialogOpen] = useState(false);
  const [sshSpec, setSshSpec] = useState("");
  const [sshError, setSshError] = useState("");
  const [sshPending, setSshPending] = useState(false);

  async function addSshProject() {
    if (sshPending) return;
    const location = parseSshProjectSpec(sshSpec);
    if (!location) {
      setSshError("Use user@host:/absolute/path or ssh://user@host/absolute/path.");
      return;
    }
    setSshPending(true);
    setSshError("");
    try {
      const result = await readBridge().checkSshProjectConnection({ projectLocation: location });
      if (!result.ok) {
        setSshError(result.message ?? "Unable to connect.");
        return;
      }
      setSshDialogOpen(false);
      setSshSpec("");
      startTransition(() => {
        const project = addProject(location);
        autoDetectSetupScript(project);
        openDraft(project.id);
      });
    } catch (error) {
      setSshError(error instanceof Error ? error.message : "Unable to connect.");
    } finally {
      setSshPending(false);
    }
  }

  return (
    <>
      <div className="lightcode-overlay-header__controls flex items-center gap-1.5">
        <Tooltip delay={150}>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              aria-label="Search"
              size="sm"
              variant="ghost"
              className="size-6 min-w-0 text-muted hover:text-foreground"
              onPress={() => usePanelStore.getState().openThreadSearch()}
            >
              <Search className="size-3.5" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom">Search</Tooltip.Content>
        </Tooltip>
        {isWindows() ? (
          <Dropdown>
            <Button
              isIconOnly
              aria-label="Add project"
              size="sm"
              variant="ghost"
              className="size-6 min-w-0 text-muted hover:text-foreground"
            >
              <FolderPlus className="size-3.5" />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                aria-label="Add project options"
                onAction={(key) => {
                  if (key === "windows") {
                    void readBridge()
                      .pickFolder()
                      .then((path) => {
                        if (!path) return;
                        startTransition(() => {
                          const project = addProject({ kind: "windows", path });
                          autoDetectSetupScript(project);
                          openDraft(project.id);
                        });
                      });
                  }
                  if (key === "wsl") {
                    void readBridge()
                      .listWslDistros()
                      .then((distros) => {
                        const distro = distros[0];
                        const defaultPath = distro
                          ? `\\\\wsl.localhost\\${distro}\\home`
                          : undefined;
                        return readBridge().pickFolder(defaultPath);
                      })
                      .then((selectedPath) => {
                        if (!selectedPath) return;
                        const parsed = parseWslUncPath(selectedPath);
                        if (!parsed) return;
                        startTransition(() => {
                          const project = addProject({
                            kind: "wsl",
                            distro: parsed.distro,
                            linuxPath: parsed.linuxPath,
                            uncPath: selectedPath,
                          });
                          autoDetectSetupScript(project);
                          openDraft(project.id);
                        });
                      });
                  }
                  if (key === "ssh") {
                    setSshDialogOpen(true);
                  }
                }}
              >
                <Dropdown.Item id="windows" textValue="Add Windows Project">
                  <Monitor className="size-4 shrink-0 text-muted" />
                  <Label>Add Windows Project</Label>
                </Dropdown.Item>
                <Dropdown.Item id="wsl" isDisabled={!wslAvailable} textValue="Add WSL Project">
                  <TuxIcon className="size-4 shrink-0 text-muted" />
                  <Label>Add WSL Project</Label>
                </Dropdown.Item>
                <Dropdown.Item id="ssh" textValue="Add SSH Project">
                  <Server className="size-4 shrink-0 text-muted" />
                  <Label>Add SSH Project</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        ) : (
          <Dropdown>
            <Button
              isIconOnly
              aria-label="Add project"
              size="sm"
              variant="ghost"
              className="size-6 min-w-0 text-muted hover:text-foreground"
            >
              <FolderPlus className="size-3.5" />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                aria-label="Add project options"
                onAction={(key) => {
                  if (key === "local") {
                    void readBridge()
                      .pickFolder()
                      .then((path) => {
                        if (!path) return;
                        startTransition(() => {
                          const project = addProject({ kind: "posix", path });
                          autoDetectSetupScript(project);
                          openDraft(project.id);
                        });
                      });
                  }
                  if (key === "ssh") {
                    setSshDialogOpen(true);
                  }
                }}
              >
                <Dropdown.Item id="local" textValue="Add Local Project">
                  <Monitor className="size-4 shrink-0 text-muted" />
                  <Label>Add Local Project</Label>
                </Dropdown.Item>
                <Dropdown.Item id="ssh" textValue="Add SSH Project">
                  <Server className="size-4 shrink-0 text-muted" />
                  <Label>Add SSH Project</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        )}
        <Dropdown>
          <Button
            isIconOnly
            aria-label="Sort threads"
            size="sm"
            variant="ghost"
            className="size-6 min-w-0 text-muted hover:text-foreground"
          >
            {(() => {
              const Icon = sortModeIcon[threadSortMode];
              return <Icon className="size-3.5" />;
            })()}
          </Button>
          <Dropdown.Popover>
            <Dropdown.Menu
              aria-label="Thread sort order"
              selectionMode="single"
              selectedKeys={[threadSortMode]}
              onAction={(key) => {
                usePanelStore.getState().setThreadSortMode(key as ThreadSortMode);
              }}
            >
              {sortModeOrder.map((mode) => {
                const Icon = sortModeIcon[mode];
                return (
                  <Dropdown.Item key={mode} id={mode} textValue={sortModeLabel[mode]}>
                    <Icon className="size-4 shrink-0 text-muted" />
                    <Label>{sortModeLabel[mode]}</Label>
                  </Dropdown.Item>
                );
              })}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        <Tooltip delay={150}>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              aria-label={browserVisible ? "Hide browser" : "Open browser"}
              size="sm"
              variant="ghost"
              className="size-6 min-w-0 text-muted hover:text-foreground"
              onPress={() => {
                const store = usePanelStore.getState();
                if (store.browserPanelOpen && store.rightPanelTab === "browser") {
                  store.setBrowserPanelOpen(false);
                } else {
                  store.setBrowserPanelOpen(true);
                  store.setRightPanelTab("browser");
                }
              }}
            >
              <Globe className="size-3.5" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom">Browser</Tooltip.Content>
        </Tooltip>
      </div>
      <Modal.Backdrop
        isOpen={sshDialogOpen}
        onOpenChange={(open) => {
          setSshDialogOpen(open);
          if (!open) setSshError("");
        }}
      >
        <Modal.Container size="sm">
          <Modal.Dialog className="sm:max-w-[420px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Add SSH Project</Modal.Heading>
            </Modal.Header>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void addSshProject();
              }}
            >
              <Modal.Body className="px-5 pb-5 pt-2">
                <Input
                  aria-label="SSH project"
                  aria-describedby={sshError ? "ssh-project-error" : undefined}
                  aria-invalid={sshError ? true : undefined}
                  placeholder="user@host:/absolute/path"
                  value={sshSpec}
                  disabled={sshPending}
                  onChange={(event) => {
                    setSshSpec(event.target.value);
                    if (sshError) setSshError("");
                  }}
                />
                {sshError && (
                  <p id="ssh-project-error" className="mt-1 text-xs text-danger">
                    {sshError}
                  </p>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button type="button" slot="close" variant="tertiary" isDisabled={sshPending}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isDisabled={sshPending}>
                  {sshPending ? "Checking..." : "Add"}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
