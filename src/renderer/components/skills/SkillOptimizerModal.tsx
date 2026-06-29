import { useEffect, useState } from "react";
import { Button, Modal, toast } from "@heroui/react";
import { ArrowRight, CheckCircle2, Wand2 } from "lucide-react";
import type {
  OptimizeSkillsResult,
  ProjectLocation,
  SkillScopeLevel,
  SkillSyncOp,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { PixelLoader } from "@/renderer/components/common";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function SkillOptimizerModal(props: {
  open: boolean;
  level: SkillScopeLevel;
  projectLocation?: ProjectLocation;
  scopeLabel: (scopeId: string) => string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { open, level, projectLocation, scopeLabel, onClose, onApplied } = props;
  const [plan, setPlan] = useState<SkillSyncOp[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    setPlan(null);
    void readBridge()
      .optimizeSkills({
        level,
        apply: false,
        ...(projectLocation ? { projectLocation } : {}),
      })
      .then((result: OptimizeSkillsResult) => {
        if (active) {
          setPlan(result.ops);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(errorMessage(err, "Couldn't compute the sync plan."));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open, level, projectLocation]);

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const result = await readBridge().optimizeSkills({
        level,
        apply: true,
        ...(projectLocation ? { projectLocation } : {}),
      });
      toast.success(
        result.ops.length === 0
          ? "Skills already in sync."
          : `Synced ${result.ops.length} skill${result.ops.length === 1 ? "" : "s"} across providers.`,
      );
      onApplied();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Couldn't sync skills."));
    } finally {
      setApplying(false);
    }
  }

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(next) => !next && onClose()}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[640px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Sync skills across providers</Modal.Heading>
            <p className="mt-1 text-xs text-muted">
              Different agents read different folders — some use <code>.agents/skills</code>, others
              read their own. This copies each {level} skill into every provider folder that&apos;s
              missing it, and refreshes copies that have drifted out of date (the newest edit wins),
              so any agent sees the same skills.
            </p>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-2 p-4">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <PixelLoader size="md" className="text-muted" />
              </div>
            ) : error ? (
              <p className="text-xs text-danger">{error}</p>
            ) : plan && plan.length > 0 ? (
              <div className="-mr-1 flex max-h-[46vh] flex-col gap-1 overflow-y-auto pr-1">
                {plan.map((op) => (
                  <div
                    key={`${op.fromScopeId}->${op.toScopeId}:${op.folderName}`}
                    className="flex items-center gap-2 rounded-lg border border-default-200 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {op.skillName}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                        op.kind === "update"
                          ? "bg-warning/15 text-warning"
                          : "bg-content2 text-muted"
                      }`}
                    >
                      {op.kind === "update" ? "update" : "new"}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-muted">
                      <span className="truncate">{scopeLabel(op.fromScopeId)}</span>
                      <ArrowRight className="size-3" />
                      <span className="truncate text-foreground/80">
                        {scopeLabel(op.toScopeId)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="size-6 text-success" />
                <p className="text-sm text-foreground">All providers already see every skill.</p>
                <p className="text-xs text-muted">Nothing to sync at the {level} level.</p>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="ghost" className="text-muted">
              {plan && plan.length > 0 ? "Cancel" : "Close"}
            </Button>
            {plan && plan.length > 0 ? (
              <Button
                variant="tertiary"
                className="gap-1.5"
                isPending={applying}
                isDisabled={applying}
                onPress={() => void apply()}
              >
                <Wand2 className="size-3.5" />
                Sync {plan.length} skill{plan.length === 1 ? "" : "s"}
              </Button>
            ) : null}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
