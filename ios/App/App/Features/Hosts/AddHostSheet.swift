import SwiftUI

/// Add / pair another host. The one-time token is a SecureField and is never logged.
struct AddHostSheet: View {
  @Bindable var session: AppSession
  @Environment(\.dismiss) private var dismiss
  @State private var pairingLink = ""
  @State private var baseURL = ""
  @State private var token = ""
  @State private var isSubmitting = false
  @State private var isShowingScanner = false
  /// mDNS discovery (V5 plan item P4): an explicit affordance; manual entry
  /// stays. Discovery only ever fills the endpoint — the one-time credential
  /// still comes from the desktop.
  @State private var hostBrowser: PoracodeHostBrowser?
  @FocusState private var focusedField: Field?

  private enum Field: Hashable {
    case link, base, token
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          Text(HostStrings.addSubtitle)
            .font(.subheadline)
            .foregroundStyle(.secondary)
          Button {
            focusedField = nil
            isShowingScanner = true
          } label: {
            Label(OnboardingStrings.scanAction, systemImage: "qrcode.viewfinder")
              .frame(maxWidth: .infinity)
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.large)
          .accessibilityIdentifier("native-e2e.add-host.scan")
          pairingLinkSection
          divider
          nearbyHostsSection
          divider
          manualSection
          if looksLikeCleartextLan {
            Label {
              Text(cleartextHint)
                .font(.footnote)
            } icon: {
              Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            }
            .accessibilityLabel(cleartextHint)
          }
          Button {
            Task { await submit() }
          } label: {
            if isSubmitting {
              ProgressView()
                .frame(maxWidth: .infinity)
            } else {
              Text(HostStrings.connect)
                .frame(maxWidth: .infinity)
            }
          }
          .poracodeProminentButtonStyle()
          .controlSize(.large)
          .disabled(isSubmitting)
          .accessibilityLabel(HostStrings.addHostAccessibility)
        }
        .padding(20)
      }
      .navigationTitle(HostStrings.addHost)
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(HostStrings.cancel) { dismiss() }
        }
      }
      .modifier(HostFormChrome())
    }
    .fullScreenCover(isPresented: $isShowingScanner) {
      PairingScannerView(
        onCandidate: applyScannedCandidate,
        onUsePairingLink: {},
        onUseManualEntry: {}
      )
    }
  }

  private var pairingLinkSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(HostStrings.pairingLink)
        .font(.headline)
      TextField(HostStrings.pairingLinkPlaceholder, text: $pairingLink, axis: .vertical)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .keyboardType(.URL)
        .lineLimit(3...6)
        .padding(12)
        .poracodeGlassBackground()
        .focused($focusedField, equals: .link)
        .accessibilityLabel(HostStrings.pairingLink)
    }
  }

  private var nearbyHostsSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(HostStrings.nearbyHosts)
          .font(.headline)
        Spacer()
        Button {
          toggleBrowsing()
        } label: {
          Text(hostBrowser?.isBrowsing == true ? HostStrings.stopDiscovering : HostStrings.discoverHosts)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .accessibilityIdentifier("native-e2e.add-host.discover")
      }
      if let browser = hostBrowser, browser.isBrowsing {
        if browser.hosts.isEmpty {
          Text(HostStrings.discoveringHosts)
            .font(.footnote)
            .foregroundStyle(.secondary)
        } else {
          ForEach(browser.hosts) { host in
            Button {
              Task {
                if let endpoint = await browser.resolveEndpoint(host) {
                  baseURL = endpoint
                  focusedField = .token
                }
              }
            } label: {
              VStack(alignment: .leading, spacing: 2) {
                Text(host.name)
                if let endpoint = host.endpoint {
                  Text(endpoint)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
          }
        }
      }
    }
  }

  private func toggleBrowsing() {
    if let browser = hostBrowser {
      if browser.isBrowsing {
        browser.stop()
      } else {
        browser.start()
      }
    } else {
      let browser = PoracodeHostBrowser()
      hostBrowser = browser
      browser.start()
    }
  }

  private var manualSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      TextField(HostStrings.serverURL, text: $baseURL)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .keyboardType(.URL)
        .padding(12)
        .poracodeGlassBackground()
        .focused($focusedField, equals: .base)
        .accessibilityLabel(HostStrings.serverURL)
      SecureField(HostStrings.oneTimeToken, text: $token)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .padding(12)
        .poracodeGlassBackground()
        .focused($focusedField, equals: .token)
        .accessibilityLabel(HostStrings.oneTimeToken)
    }
  }

  private var divider: some View {
    HStack {
      Rectangle().frame(height: 1).foregroundStyle(.quaternary)
      Text(HostStrings.orSeparator)
        .font(.caption)
        .foregroundStyle(.secondary)
      Rectangle().frame(height: 1).foregroundStyle(.quaternary)
    }
    .accessibilityHidden(true)
  }

  private var looksLikeCleartextLan: Bool {
    PairingURL.isCleartextLanURL(resolvedEndpointCandidate())
  }

  private var cleartextHint: String {
    String(
      localized: "hosts.add.cleartext.hint",
      defaultValue:
        "This endpoint uses plain HTTP on a local network address. Traffic is not encrypted."
    )
  }

  private func resolvedEndpointCandidate() -> String {
    let pasted = pairingLink.trimmingCharacters(in: .whitespacesAndNewlines)
    if !pasted.isEmpty {
      return (try? PairingURL.normalizeEndpoint(pasted)) ?? pasted
    }
    let base = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    return (try? PairingURL.normalizeEndpoint(base)) ?? base
  }

  private func submit() async {
    focusedField = nil
    await performPair()
  }

  private func applyScannedCandidate(_ candidate: PairingURL.PairingCandidate) {
    pairingLink = candidate.pairingURLOrEmpty
    baseURL = candidate.manualBaseURL
    token = candidate.manualToken
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
    if session.phase == .ready || session.phase == .connecting {
      dismiss()
    }
  }
}

private struct HostFormChrome: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 18.0, *) {
      content.presentationSizing(.form)
    } else {
      content
    }
  }
}
