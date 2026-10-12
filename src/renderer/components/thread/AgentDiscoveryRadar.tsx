import { WelcomeAppIcon } from "@/renderer/components/common/WelcomeAppIcon";

/**
 * The discovery hero: the Poracode mark pinging the system. Signal rings push
 * out from the app icon while a marker sweeps its orbit — the pairing
 * handshake's motion language, so the scan reads as the same product as every
 * other first-launch surface. Each newly found agent fires one arrival ring
 * (keyed on the count, so it replays per find).
 *
 * Purely decorative: the status line under the hero carries the live state
 * for assistive tech, and every animated layer flatlines under reduced
 * motion.
 */
export function AgentDiscoveryRadar(props: { foundCount: number }) {
  return (
    <div aria-hidden="true" className="relative flex size-44 items-center justify-center">
      <span className="poracode-pair-ripple absolute inset-0 rounded-full border border-accent/60" />
      <span className="poracode-pair-ripple poracode-pair-ripple-2 absolute inset-0 rounded-full border border-accent/60" />
      <span className="poracode-pair-ripple poracode-pair-ripple-3 absolute inset-0 rounded-full border border-accent/60" />
      <span className="poracode-pair-orbit absolute inset-[14%] rounded-full border border-accent/15">
        <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
      </span>
      {props.foundCount > 0 ? (
        <span
          key={props.foundCount}
          className="agent-discovery-radar__arrival absolute inset-[6%] rounded-full"
        />
      ) : null}
      <WelcomeAppIcon intro={false} />
    </div>
  );
}
