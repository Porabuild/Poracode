import SwiftUI

/// Decorative, intentionally non-compiling code used behind the native welcome.
/// It mirrors the renderer's code wall without introducing a web view or sharing UI code.
private let onboardingCodeWall = """
import { startTransition, useEffect, useState } from "react";
import { invokeAgent, type AgentStatus } from "@poracode/agents";
import { PTYSession } from "@/shared/pty";
import { useAppStore } from "@/renderer/state/appStore";
import { readBridge } from "@/renderer/bridge";

export interface OrchestratorProps {
  projectId: string;
  initialPrompt?: string;
}

export function AgentOrchestrator({ projectId }: OrchestratorProps) {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const dispatch = useAppStore((state) => state.dispatch);

  useEffect(() => {
    const session = new PTYSession(projectId);
    session.on("data", (chunk) => dispatch({ type: "PTY_DATA", payload: chunk }));
    return () => session.kill();
  }, [projectId]);

  return <TerminalView status={status} />;
}

export class SupervisorRuntime {
  private workers = new Map<string, Worker>();
  async spawn(config: RuntimeConfig) {
    const worker = new Worker(config.entrypoint, { type: "module" });
    worker.postMessage({ type: "INIT", config });
    return worker;
  }
}
"""

/// Near-black code wall with a softly breathing brand light behind the hero.
struct OnboardingBackdrop: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var illuminated = false

  var body: some View {
    ZStack {
      Color(red: 0.018, green: 0.018, blue: 0.024)

      Text(onboardingCodeWall + onboardingCodeWall)
        .font(.system(size: 10, weight: .regular, design: .monospaced))
        .foregroundStyle(.white.opacity(0.065))
        .lineSpacing(5)
        .frame(maxWidth: 680, maxHeight: .infinity, alignment: .topLeading)
        .padding(.horizontal, 34)
        .padding(.top, 40)
        .mask {
          RadialGradient(
            colors: [.white, .white.opacity(0.72), .clear],
            center: UnitPoint(x: 0.5, y: 0.42),
            startRadius: 24,
            endRadius: 320
          )
        }

      RadialGradient(
        colors: [
          Color.white.opacity(illuminated ? 0.095 : 0.055),
          OnboardingBrand.violet.opacity(illuminated ? 0.045 : 0.022),
          .clear,
        ],
        center: UnitPoint(x: 0.5, y: 0.42),
        startRadius: 8,
        endRadius: 280
      )
      .scaleEffect(illuminated ? 1.08 : 0.86)
      .blendMode(.screen)
    }
    .ignoresSafeArea()
    .allowsHitTesting(false)
    .accessibilityHidden(true)
    .onAppear {
      guard !reduceMotion else {
        illuminated = true
        return
      }
      withAnimation(.easeInOut(duration: 3.2).repeatForever(autoreverses: true)) {
        illuminated = true
      }
    }
  }
}

/// Native counterpart of the PWA's comet landing and always-on lightning ring.
struct OnboardingAnimatedBrandMark: View {
  let size: CGFloat

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var landed = false
  @State private var splashExpanded = false
  @State private var clockwiseAngle = 0.0
  @State private var counterclockwiseAngle = 360.0
  @State private var glowBright = false

  private var markShape: RoundedRectangle {
    RoundedRectangle(cornerRadius: size * 0.27, style: .continuous)
  }

  private var ringShape: RoundedRectangle {
    RoundedRectangle(cornerRadius: (size + 6) * 0.27, style: .continuous)
  }

  var body: some View {
    ZStack {
      Circle()
        .fill(
          RadialGradient(
            colors: [
              Color.white.opacity(glowBright ? 0.18 : 0.08),
              OnboardingBrand.violet.opacity(glowBright ? 0.075 : 0.035),
              .clear,
            ],
            center: .center,
            startRadius: 1,
            endRadius: size * 0.95
          )
        )
        .frame(width: size * 2.2, height: size * 2.2)
        .blur(radius: 9)
        .scaleEffect(glowBright ? 1.08 : 0.82)

      Circle()
        .stroke(Color.white.opacity(0.34), lineWidth: 1)
        .frame(width: size * 1.15, height: size * 1.15)
        .scaleEffect(splashExpanded ? 4.8 : 0.08)
        .opacity(splashExpanded ? 0 : 0.65)

      ringShape
        .stroke(
          AngularGradient(
            gradient: Gradient(stops: [
              .init(color: .clear, location: 0),
              .init(color: .clear, location: 0.50),
              .init(color: OnboardingBrand.violet.opacity(0.15), location: 0.61),
              .init(color: OnboardingBrand.violet, location: 0.75),
              .init(color: .white, location: 0.82),
              .init(color: OnboardingBrand.violet, location: 0.89),
              .init(color: OnboardingBrand.violet.opacity(0.15), location: 0.97),
              .init(color: .clear, location: 1),
            ]),
            center: .center,
            startAngle: .degrees(clockwiseAngle),
            endAngle: .degrees(clockwiseAngle + 360)
          ),
          lineWidth: 2
        )
        .frame(width: size + 6, height: size + 6)
        .shadow(color: OnboardingBrand.violet.opacity(0.22), radius: 9)

      ringShape
        .stroke(
          AngularGradient(
            gradient: Gradient(stops: [
              .init(color: .clear, location: 0),
              .init(color: .clear, location: 0.33),
              .init(color: OnboardingBrand.violet.opacity(0.15), location: 0.44),
              .init(color: OnboardingBrand.violet, location: 0.61),
              .init(color: .white.opacity(0.85), location: 0.69),
              .init(color: OnboardingBrand.violet, location: 0.78),
              .init(color: OnboardingBrand.violet.opacity(0.15), location: 0.89),
              .init(color: .clear, location: 1),
            ]),
            center: .center,
            startAngle: .degrees(counterclockwiseAngle),
            endAngle: .degrees(counterclockwiseAngle + 360)
          ),
          lineWidth: 1
        )
        .frame(width: size + 6, height: size + 6)
        .blur(radius: 0.5)

      markShape
        .fill(Color.white.opacity(0.035))
        .frame(width: size + 4, height: size + 4)

      Image("BrandMark")
        .resizable()
        .scaledToFit()
        .frame(width: size, height: size)
        .clipShape(markShape)
        .overlay { markShape.strokeBorder(OnboardingBrand.hairline, lineWidth: 1) }
        .shadow(color: .white.opacity(0.08), radius: 14)
        .shadow(color: OnboardingBrand.violet.opacity(0.16), radius: 18)
        .scaleEffect(landed ? 1 : 0.78)
        .offset(y: landed ? 0 : 18)
        .opacity(landed ? 1 : 0)
    }
    .frame(width: size * 2.2, height: size * 2.2)
    .accessibilityHidden(true)
    .onAppear {
      if reduceMotion {
        landed = true
        splashExpanded = true
        glowBright = true
        return
      }

      withAnimation(.spring(response: 0.72, dampingFraction: 0.72).delay(0.22)) {
        landed = true
      }
      withAnimation(.easeOut(duration: 0.9).delay(0.68)) {
        splashExpanded = true
      }
      withAnimation(.linear(duration: 6).repeatForever(autoreverses: false)) {
        clockwiseAngle = 360
      }
      withAnimation(.linear(duration: 4).repeatForever(autoreverses: false)) {
        counterclockwiseAngle = 0
      }
      withAnimation(.easeInOut(duration: 2).repeatForever(autoreverses: true)) {
        glowBright = true
      }
    }
  }
}
