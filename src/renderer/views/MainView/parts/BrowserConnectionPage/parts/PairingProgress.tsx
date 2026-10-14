import { Link2 } from "lucide-react";

/**
 * The pairing handshake, shown while a scanned or pasted URL is being
 * registered: signal rings pushing out from the link core with a marker
 * sweeping its orbit.
 *
 * Deliberately device-agnostic — this client may be a phone, a tablet, or
 * another desktop, so the motion shows a link being established rather than
 * any particular pair of devices. Sized by its container so the same component
 * fills the viewfinder slot on touch and the app-icon slot on desktop. Purely
 * decorative: the surrounding label carries the state for assistive tech, and
 * the motion stops under reduced motion.
 */
export function PairingProgress({ className }: { readonly className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid="pairing-progress"
      className={`relative flex aspect-square items-center justify-center ${className ?? ""}`}
    >
      <span className="poracode-pair-ripple absolute inset-0 rounded-full border border-accent/60" />
      <span className="poracode-pair-ripple poracode-pair-ripple-2 absolute inset-0 rounded-full border border-accent/60" />
      <span className="poracode-pair-ripple poracode-pair-ripple-3 absolute inset-0 rounded-full border border-accent/60" />

      <span className="poracode-pair-orbit absolute inset-[18%] rounded-full border border-accent/15">
        <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
      </span>

      <span className="relative flex size-[38%] items-center justify-center rounded-full bg-accent/12 text-accent">
        <Link2 className="size-1/2" strokeWidth={1.75} />
      </span>
    </div>
  );
}
