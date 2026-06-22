import { Sparkles } from "lucide-react";
import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { PixelLoader } from "@/renderer/components/common";
import { GitReviewSection } from "./GitReviewSection";

export function ConflictResolutionActions(props: {
  canResolveWithAgent: boolean;
  isAbortingMerge: boolean;
  onResolveWithAgent: () => void;
  onAbortMerge: () => Promise<void>;
}) {
  const { canResolveWithAgent, isAbortingMerge, onResolveWithAgent, onAbortMerge } = props;

  return (
    <GitReviewSection>
      <div className="@container">
        <div className="flex flex-col gap-2 @[18rem]:flex-row">
          <Button
            variant="tertiary"
            size="sm"
            className="w-full @[18rem]:flex-1"
            isDisabled={!canResolveWithAgent || isAbortingMerge}
            onPress={onResolveWithAgent}
          >
            <Sparkles className="size-3.5" />
            <Trans>Fix in Agent</Trans>
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            className="w-full text-danger hover:text-danger @[18rem]:flex-1"
            isPending={isAbortingMerge}
            onPress={() => void onAbortMerge()}
          >
            {({ isPending }) => (
              <>
                {isPending && <PixelLoader size="xs" />}
                <Trans>Abort Merge</Trans>
              </>
            )}
          </Button>
        </div>
      </div>
    </GitReviewSection>
  );
}
