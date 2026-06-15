import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Label, Modal } from "@heroui/react";
import { Button, Input } from "@/renderer/components/common";
import type { ProfileIdentity } from "@/shared/contracts";
import { initialsFor } from "../format";

const AVATAR_PALETTE = [
  "oklch(0.62 0.11 245)",
  "oklch(0.6 0.14 295)",
  "oklch(0.58 0.15 25)",
  "oklch(0.6 0.13 150)",
  "oklch(0.66 0.13 78)",
  "oklch(0.6 0.12 200)",
];

export function EditProfileDialog(props: {
  open: boolean;
  identity: ProfileIdentity;
  onClose: () => void;
  onSave: (identity: ProfileIdentity) => Promise<void>;
}) {
  const { open, identity, onClose, onSave } = props;
  const [name, setName] = useState(identity.name);
  const [handle, setHandle] = useState(identity.handle);
  const [avatarColor, setAvatarColor] = useState(identity.avatarColor);
  const [saving, setSaving] = useState(false);

  // Reset the form to the latest identity each time the dialog opens.
  useEffect(() => {
    if (open) {
      setName(identity.name);
      setHandle(identity.handle);
      setAvatarColor(
        AVATAR_PALETTE.includes(identity.avatarColor) ? identity.avatarColor : AVATAR_PALETTE[0]!,
      );
    }
  }, [open, identity]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        ...identity,
        name: name.trim() || identity.name,
        handle,
        avatarColor,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(next) => !next && onClose()}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[420px]">
          <div className="flex flex-col gap-5 p-5">
            <div className="flex items-center gap-3">
              <div
                className="flex size-12 items-center justify-center rounded-full text-lg font-semibold text-white"
                style={{ backgroundColor: avatarColor }}
              >
                {initialsFor(name || identity.name)}
              </div>
              <h2 className="text-base font-semibold text-foreground">Edit profile</h2>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted">Handle</Label>
              <Input
                value={handle}
                onChange={(e) =>
                  setHandle(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
                }
                placeholder="handle"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted">Avatar color</Label>
              <div className="flex gap-2">
                {AVATAR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Avatar color ${color}`}
                    onClick={() => setAvatarColor(color)}
                    className="flex size-7 items-center justify-center rounded-full transition-transform hover:scale-105"
                    style={{ backgroundColor: color }}
                  >
                    {avatarColor === color ? <Check className="size-3.5 text-white" /> : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onPress={onClose} className="text-muted">
                Cancel
              </Button>
              <Button variant="tertiary" isPending={saving} onPress={() => void handleSave()}>
                Save
              </Button>
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
