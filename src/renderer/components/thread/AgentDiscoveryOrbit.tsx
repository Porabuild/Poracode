import { BrandWordmark } from "@/renderer/components/common/BrandWordmark";

/** CSS-only scan artwork. Each new arrival sends one ripple out of the scan. */
export function AgentDiscoveryOrbit(props: { foundCount: number }) {
  return (
    <div className="agent-discovery-orbit" aria-hidden="true">
      <div className="agent-discovery-orbit__halo" />
      <div className="agent-discovery-orbit__plane agent-discovery-orbit__plane--one">
        <div className="agent-discovery-orbit__track" />
      </div>
      <div className="agent-discovery-orbit__plane agent-discovery-orbit__plane--two">
        <div className="agent-discovery-orbit__track" />
      </div>
      <div className="agent-discovery-orbit__plane agent-discovery-orbit__plane--three">
        <div className="agent-discovery-orbit__track" />
      </div>
      {props.foundCount > 0 ? (
        <div key={props.foundCount} className="agent-discovery-orbit__arrival" />
      ) : null}
      <BrandWordmark className="agent-discovery-orbit__wordmark text-xl tracking-tight" />
    </div>
  );
}
