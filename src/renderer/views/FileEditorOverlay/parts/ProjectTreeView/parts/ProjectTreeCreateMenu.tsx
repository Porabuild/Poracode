import { Dropdown, Label } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { FilePlus, FolderPlus, Plus } from "lucide-react";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";

export function ProjectTreeCreateMenu(props: {
  readonly onCreate: (type: "file" | "directory") => void;
}) {
  const { t } = useLingui();

  return (
    <Dropdown>
      <MobileCircleButton aria-label={t`Add`} className="text-muted">
        <Plus className="size-4" />
      </MobileCircleButton>
      <Dropdown.Popover placement="top end">
        <Dropdown.Menu
          aria-label={t`Add`}
          selectionMode="none"
          className="poracode-menu min-w-44"
          onAction={(key) => {
            if (key === "new-file") props.onCreate("file");
            if (key === "new-folder") props.onCreate("directory");
          }}
        >
          <Dropdown.Item id="new-file" textValue={t`New File`}>
            <FilePlus className="size-4 shrink-0 text-muted" />
            <Label>{t`New File`}</Label>
          </Dropdown.Item>
          <Dropdown.Item id="new-folder" textValue={t`New Folder`}>
            <FolderPlus className="size-4 shrink-0 text-muted" />
            <Label>{t`New Folder`}</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
