import SwiftUI

/// First-run pairing surface.
///
/// Scanning the desktop pairing code is the one visible route. Every other route —
/// pasting a pairing link, and endpoint + one-time token entry — lives in a
/// native bottom sheet with the Connect button. Because this screen is the only
/// way in, the sheet starts open whenever a repair phase needs Connect without an extra tap
/// (see `shouldPresentOtherWays`). Every repair/consent state
/// (`sessionExpired`, `protocolIncompatible`, `localStoreInconsistent`, and the
/// pending-pairing card) is preserved, and the scan route submits through the same
/// `submit()` path as a pasted link.
struct OnboardingView: View {
  @Bindable var session: AppSession
  @State private var pairingLink = ""
  @State private var baseURL = ""
  @State private var token = ""
  @State private var isSubmitting = false
  @State private var isShowingScanner = false
  @State private var isShowingOtherWays = false
  @FocusState private var focusedField: OnboardingField?

  var body: some View {
    NavigationStack {
      GeometryReader { geometry in
        ScrollView {
          VStack(spacing: 12) {
            Spacer(minLength: 0)
            OnboardingHeroView(
              title: heroTitle,
              subtitle: headerSubtitle,
              pairedLabel: pairedLabel
            )
            Spacer(minLength: 0)
            if session.phase == .sessionExpired {
              sessionExpiredBanner
            }
            if session.phase == .protocolIncompatible {
              protocolIncompatibleBanner
            }
            if session.phase == .localStoreInconsistent {
              localStoreInconsistentBanner
            }
            if let pending = session.pendingPairing {
              pendingPairingCard(pending)
            }
            OnboardingScanCard { isShowingScanner = true }
            OnboardingOtherWaysButton { isShowingOtherWays = true }
            if let error = session.globalError {
              pairingError(error)
            }
            // Disconnect/Forget must remain reachable for repair states even when profile is nil.
            if session.profile != nil
              || session.phase == .localStoreInconsistent
              || session.phase == .protocolIncompatible
              || session.phase == .sessionExpired
            {
              disconnectButton
            }
            // The compact web surface reserves roughly one control-row below
            // its actions. Mirror that breathing room on first launch so the
            // scan routes sit at the same visual height without affecting the
            // taller repair flows.
            Spacer()
              .frame(height: showsMinimalChrome ? 112 : 0)
          }
          .padding(20)
          .frame(maxWidth: 560)
          .frame(maxWidth: .infinity)
          // Equal flexible space around the hero keeps it visually centered in
          // the area above the bottom actions. Short/accessibility layouts still
          // collapse the spacers and scroll normally.
          .frame(minHeight: geometry.size.height)
        }
        .scrollDismissesKeyboard(.interactively)
      }
      .background { OnboardingBackdrop() }
      .onAppear {
        if shouldPresentOtherWays {
          isShowingOtherWays = true
        }
      }
      .onChange(of: session.phase) {
        // A phase can turn into a repair state while this screen is open.
        if shouldPresentOtherWays {
          isShowingOtherWays = true
        }
      }
      .onChange(of: session.pendingPairing != nil) { _, isPending in
        // Consent owns the screen; keep the endpoint/token form behind it.
        if isPending {
          isShowingOtherWays = false
        }
      }
      .navigationTitle(navigationTitle)
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        if !session.hosts.isEmpty {
          ToolbarItem(placement: .topBarTrailing) {
            HostSwitcherEntry(session: session)
          }
        }
      }
      .toolbar(showsMinimalChrome ? .hidden : .visible, for: .navigationBar)
      .fullScreenCover(isPresented: $isShowingScanner) {
        PairingScannerView(
          onCandidate: { candidate in
            applyScannedCandidate(candidate)
          },
          // Focus set while the cover dismisses does not survive the transition, so
          // both fallbacks just reveal the section and let the user tap a field.
          onUsePairingLink: {
            isShowingOtherWays = true
          },
          onUseManualEntry: {
            isShowingOtherWays = true
          }
        )
      }
      .sheet(isPresented: $isShowingOtherWays) {
        NavigationStack {
          ScrollView {
            OnboardingOtherWaysForm(
              pairingLink: $pairingLink,
              baseURL: $baseURL,
              token: $token,
              focusedField: $focusedField,
              showsCleartextHint: looksLikeCleartextLan
            )
            .padding(20)
          }
          .scrollDismissesKeyboard(.interactively)
          .safeAreaInset(edge: .bottom, spacing: 0) {
            otherWaysActionBar
          }
          .navigationTitle(OnboardingStrings.otherWays)
          .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.fraction(0.7), .large])
        .presentationDragIndicator(.visible)
      }
    }
    .preferredColorScheme(.dark)
  }

  private var navigationTitle: String {
    switch session.phase {
    case .sessionExpired: return OnboardingStrings.navSessionExpired
    case .protocolIncompatible: return OnboardingStrings.navProtocolIncompatible
    case .localStoreInconsistent: return OnboardingStrings.navRepairRequired
    default: return OnboardingStrings.navConnect
    }
  }

  private var showsMinimalChrome: Bool {
    session.hosts.isEmpty
      && session.pendingPairing == nil
      && session.phase != .sessionExpired
      && session.phase != .protocolIncompatible
      && session.phase != .localStoreInconsistent
  }

  /// The recovery phases keep a worded heading — it is the signal that something
  /// is wrong. Only the normal connect phase shows the brand wordmark.
  private var heroTitle: OnboardingHeroTitle {
    switch session.phase {
    case .sessionExpired: return .text(OnboardingStrings.headerSessionExpired)
    case .protocolIncompatible: return .text(OnboardingStrings.headerUpdateRequired)
    case .localStoreInconsistent: return .text(OnboardingStrings.headerRepairRequired)
    default: return .wordmark
    }
  }

  private var headerSubtitle: String {
    switch session.phase {
    case .protocolIncompatible:
      return OnboardingStrings.subtitleProtocolIncompatible
    case .localStoreInconsistent:
      return OnboardingStrings.subtitleStoreInconsistent
    default:
      return OnboardingStrings.subtitleDefault
    }
  }

  private var pairedLabel: String? {
    guard let label = session.profile?.label else { return nil }
    return OnboardingStrings.pairedLabel(label)
  }

  private var sessionExpiredBanner: some View {
    OnboardingStatusBanner(
      systemImage: "lock.rotation",
      tint: OnboardingBrand.violet,
      message: OnboardingStrings.bannerSessionExpired,
      accessibilityText: OnboardingStrings.bannerSessionExpiredLabel
    )
  }

  private var protocolIncompatibleBanner: some View {
    OnboardingStatusBanner(
      systemImage: "exclamationmark.triangle.fill",
      tint: .orange,
      message: OnboardingStrings.bannerProtocolIncompatible,
      accessibilityText: OnboardingStrings.bannerProtocolIncompatibleLabel
    )
  }

  private var localStoreInconsistentBanner: some View {
    OnboardingStatusBanner(
      systemImage: "externaldrive.badge.exclamationmark",
      tint: .red,
      message: OnboardingStrings.bannerStoreInconsistent,
      accessibilityText: OnboardingStrings.bannerStoreInconsistentLabel
    )
  }

  private func pendingPairingCard(_ pending: PendingPairingState) -> some View {
    OnboardingPendingPairingCard(
      pending: pending,
      onCancel: { session.cancelPendingPairing() },
      onConfirm: { Task { await session.confirmPendingPairing() } }
    )
  }

  /// Scanning is the expected route, so the other ways stay collapsed — except when
  /// collapsing them would hide the only route that can work:
  ///
  /// - `sessionExpired` and `protocolIncompatible` reuse Connect as "Re-pair", so the
  ///   sheet must be presented immediately;
  /// - `localStoreInconsistent` is repaired with Disconnect (always visible), but it
  ///   is still a broken state where every remaining route should be on screen.
  ///
  /// `connecting`, `launching`, `needsPairing`, and `ready` stay collapsed.
  private var shouldPresentOtherWays: Bool {
    guard session.pendingPairing == nil else { return false }

    switch session.phase {
    case .sessionExpired, .protocolIncompatible, .localStoreInconsistent:
      return true
    default:
      return false
    }
  }

  private var connectButton: some View {
    Button {
      Task { await submit() }
    } label: {
      if isSubmitting || session.phase == .connecting {
        ProgressView()
          .frame(maxWidth: .infinity)
      } else {
        Text(connectButtonTitle)
          .frame(maxWidth: .infinity)
      }
    }
    .poracodeProminentButtonStyle()
    .controlSize(.large)
    .disabled(isSubmitting || session.phase == .connecting)
    .accessibilityLabel(connectButtonAccessibilityLabel)
    .accessibilityIdentifier("native-e2e.pair.submit")
  }

  /// Keeps the primary action reachable while long pairing links, validation
  /// hints, and the software keyboard reduce the sheet's available height.
  private var otherWaysActionBar: some View {
    VStack(spacing: 12) {
      if let error = session.globalError {
        pairingError(error)
      }
      connectButton
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 12)
    .background(.ultraThinMaterial)
    .overlay(alignment: .top) {
      Divider()
    }
  }

  private func pairingError(_ error: String) -> some View {
    Text(error)
      .font(.footnote)
      .foregroundStyle(.red)
      .frame(maxWidth: .infinity, alignment: .leading)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityLabel(OnboardingStrings.errorAccessibility(error))
  }

  private var connectButtonTitle: String {
    switch session.phase {
    case .sessionExpired, .protocolIncompatible: return OnboardingStrings.connectRepair
    default: return HostStrings.connect
    }
  }

  private var connectButtonAccessibilityLabel: String {
    switch session.phase {
    case .sessionExpired: return OnboardingStrings.connectAccessibilitySessionExpired
    case .protocolIncompatible: return OnboardingStrings.connectAccessibilityProtocolIncompatible
    default: return OnboardingStrings.connectAccessibilityDefault
    }
  }

  private var disconnectButton: some View {
    Button(role: .destructive) {
      Task { await session.unpair() }
    } label: {
      Text(disconnectButtonTitle)
        .frame(maxWidth: .infinity)
    }
    .buttonStyle(.bordered)
    .controlSize(.large)
    .disabled(isSubmitting || session.phase == .connecting)
    .accessibilityLabel(disconnectButtonAccessibilityLabel)
  }

  private var disconnectButtonTitle: String {
    switch session.phase {
    case .localStoreInconsistent, .protocolIncompatible:
      return OnboardingStrings.disconnectForget
    default:
      return OnboardingStrings.disconnectDefault
    }
  }

  private var disconnectButtonAccessibilityLabel: String {
    switch session.phase {
    case .localStoreInconsistent:
      return OnboardingStrings.disconnectAccessibilityStoreInconsistent
    case .protocolIncompatible:
      return OnboardingStrings.disconnectAccessibilityProtocolIncompatible
    default:
      return OnboardingStrings.disconnectAccessibilityDefault
    }
  }

  private var looksLikeCleartextLan: Bool {
    let candidate = resolvedEndpointCandidate()
    return PairingURL.isCleartextLanURL(candidate)
  }

  private func resolvedEndpointCandidate() -> String {
    let pasted = pairingLink.trimmingCharacters(in: .whitespacesAndNewlines)
    if !pasted.isEmpty {
      return (try? PairingURL.normalizeEndpoint(pasted)) ?? pasted
    }
    let base = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    return (try? PairingURL.normalizeEndpoint(base)) ?? base
  }

  /// Scanned codes reuse the pasted-link inputs and `submit()`, so pairing follows
  /// the same validation and pending-pairing consent flow as manual entry.
  private func applyScannedCandidate(_ candidate: PairingURL.PairingCandidate) {
    pairingLink = candidate.pairingURLOrEmpty
    baseURL = candidate.manualBaseURL
    token = candidate.manualToken
    Task { await submit() }
  }

  private func submit() async {
    focusedField = nil
    await performPair()
  }

  private func performPair() async {
    isSubmitting = true
    defer { isSubmitting = false }
    await session.pair(
      with: .init(
        pairingURLOrEmpty: pairingLink,
        manualBaseURL: baseURL,
        manualToken: token
      )
    )
  }
}
