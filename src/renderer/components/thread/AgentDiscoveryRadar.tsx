import { useEffect, useState, type CSSProperties } from "react";
import { WelcomeAppIcon } from "@/renderer/components/common/WelcomeAppIcon";
import { prefersReducedMotion } from "./useDiscoveryCardMotion";

const RADAR_EXIT_FALLBACK_MS = 620;
const MAX_ORBIT_AGENTS = 18;
const GOLDEN_ANGLE_DEG = 137.507764;
const RADII_PX = [62, 72, 80] as const;
const ORBIT_DURATIONS_S = [52, 68, 86] as const;

interface OrbitNode {
  angle: number;
  radius: number;
  orbitDurationS: number;
  size: number;
}

/**
 * Deterministic golden-angle placement indexed solely by arrival order so
 * existing planets never jump to new angles when another agent is found.
 */
function orbitNode(index: number): OrbitNode {
  const tier = index % RADII_PX.length;
  return {
    angle: index * GOLDEN_ANGLE_DEG - 90,
    radius: RADII_PX[tier]!,
    orbitDurationS: ORBIT_DURATIONS_S[tier]!,
    size: index % 4 === 0 ? 6 : 5,
  };
}

/**
 * The discovery hero: the Poracode mark scanning a small constellation. Signal
 * rings and a sweeping beam show the active scan; each discovered agent
 * emerges from the mark's ring along its own fixed radial path and settles
 * into a slow, calm orbital drift around the mark.
 *
 * When the scan completes the active sweep/ripple signals gently fade out,
 * while the discovered constellation and subtle orbit rings remain gently
 * drifting around the mark behind the results. Purely decorative: the status
 * line under the hero carries the live state for assistive tech, and every
 * animated layer flatlines under reduced motion.
 */
export function AgentDiscoveryRadar(props: { foundCount: number; scanning: boolean }) {
  const [showSignals, setShowSignals] = useState(props.scanning);
  const [prevScanning, setPrevScanning] = useState(props.scanning);

  if (prevScanning !== props.scanning) {
    setPrevScanning(props.scanning);
    if (props.scanning) setShowSignals(true);
  }

  useEffect(() => {
    if (props.scanning || !showSignals) return;
    const timer = window.setTimeout(
      () => setShowSignals(false),
      prefersReducedMotion() ? 0 : RADAR_EXIT_FALLBACK_MS,
    );
    return () => window.clearTimeout(timer);
  }, [props.scanning, showSignals]);

  const visibleCount = Math.min(props.foundCount, MAX_ORBIT_AGENTS);
  const showConstellation = showSignals || visibleCount > 0;

  return (
    <div aria-hidden="true" className="relative flex size-44 items-center justify-center">
      {showConstellation ? (
        <div
          className={`agent-discovery-radar__constellation pointer-events-none absolute inset-0 ${
            props.scanning ? "" : "agent-discovery-radar__constellation--settled"
          }`}
        >
          <span className="agent-discovery-radar__orbit-ring absolute inset-[12%] rounded-full border border-accent/10" />
          <span className="agent-discovery-radar__orbit-ring agent-discovery-radar__orbit-ring--outer absolute inset-[3%] rounded-full border border-accent/10" />
          {Array.from({ length: visibleCount }, (_, index) => {
            const node = orbitNode(index);
            return (
              <span
                key={index}
                className="agent-discovery-radar__planet-track absolute left-1/2 top-1/2"
                style={
                  {
                    "--planet-angle": `${node.angle}deg`,
                    "--planet-radius": `${node.radius}px`,
                    "--planet-orbit-duration": `${node.orbitDurationS}s`,
                  } as CSSProperties
                }
              >
                <span
                  className="agent-discovery-radar__planet"
                  style={
                    {
                      "--planet-size": `${node.size}px`,
                    } as CSSProperties
                  }
                />
              </span>
            );
          })}
        </div>
      ) : null}
      {showSignals ? (
        <div
          className={`agent-discovery-radar__signals pointer-events-none absolute inset-0 ${
            props.scanning ? "" : "agent-discovery-radar__signals--exiting"
          }`}
          onTransitionEnd={(event) => {
            if (
              !props.scanning &&
              event.target === event.currentTarget &&
              event.propertyName === "opacity"
            ) {
              setShowSignals(false);
            }
          }}
        >
          <span className="poracode-pair-ripple absolute inset-0 rounded-full border border-accent/45" />
          <span className="poracode-pair-ripple poracode-pair-ripple-2 absolute inset-0 rounded-full border border-accent/45" />
          <span className="poracode-pair-ripple poracode-pair-ripple-3 absolute inset-0 rounded-full border border-accent/45" />
          <span className="agent-discovery-radar__scanner absolute inset-0">
            <span className="agent-discovery-radar__scanner-beam absolute inset-0" />
          </span>
        </div>
      ) : null}
      <WelcomeAppIcon intro={false} />
    </div>
  );
}
