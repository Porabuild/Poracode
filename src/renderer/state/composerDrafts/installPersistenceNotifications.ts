import { toast } from "@heroui/react";
import { clientDraftPersistenceError } from "./persistenceError";

export function installDraftPersistenceNotifications(): () => void {
  const report = () => toast.danger(clientDraftPersistenceError().message);
  window.addEventListener("poracode:composer-draft-save-failed", report);
  return () => window.removeEventListener("poracode:composer-draft-save-failed", report);
}
