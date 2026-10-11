import SwiftUI

/// The native profile summary mirrors the PWA's information hierarchy while keeping
/// the controls idiomatic to iOS: menus for scope filters, a segmented range picker,
/// and a vertically scrolling usage dashboard.
struct SettingsProfileDashboard: View {
  let information: SettingsProfileInformation
  @Binding var query: SettingsProfileQuery
  let canEdit: Bool
  let edit: () -> Void
  let refresh: () -> Void

  @State private var selectedMetric: SettingsProfileHeatmapMetric?

  var body: some View {
    ScrollView {
      LazyVStack(spacing: 28) {
        profileHeader
        rangeAndStats
        activity
        SettingsProfileDetails(
          information: information,
          metric: activeMetric,
          selectedAccount: query.provider
        )
      }
      .padding(.horizontal, 12)
      .padding(.top, 24)
      .padding(.bottom, 32)
    }
    .background(Color(uiColor: .systemBackground))
    .refreshable { refresh() }
  }

  private var identity: SettingsProfileIdentity { information.core.identity }

  private var activeMetric: SettingsProfileHeatmapMetric {
    if selectedMetric == .tokens, !information.tokens.available { return .prompts }
    return selectedMetric ?? (information.tokens.available ? .tokens : .prompts)
  }

  private var profileHeader: some View {
    VStack(spacing: 12) {
      Text(ProfilePresentation.initials(identity.name))
        .font(.system(size: 25, weight: .semibold))
        .foregroundStyle(.white)
        .frame(width: 80, height: 80)
        .background(ProfilePresentation.avatarColor(identity.avatarColor), in: Circle())
        .shadow(color: .black.opacity(0.08), radius: 2, y: 1)

      VStack(spacing: 3) {
        Text(identity.name)
          .font(.title2.weight(.semibold))
          .foregroundStyle(.primary)
        HStack(spacing: 4) {
          Text("@\(identity.handle)  -  \(identity.plan ?? SettingsUIStrings.localPlan)")
            .font(.subheadline)
            .foregroundStyle(.secondary)
          if canEdit {
            Button(action: edit) {
              Image(systemName: "pencil")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.secondary)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(SettingsUIStrings.edit)
          }
        }
      }

      HStack(spacing: 16) {
        deviceMenu
        if information.core.availableAccounts.count > 1 { accountMenu }
      }
      .font(.subheadline)
      .foregroundStyle(.primary)
      .padding(.top, 8)
    }
    .frame(maxWidth: .infinity)
    .multilineTextAlignment(.center)
  }

  private var deviceMenu: some View {
    Menu {
      Button {
        selectDevice(nil)
      } label: {
        menuActionLabel(SettingsUIStrings.allDevices, systemImage: "globe")
      }
      .buttonStyle(.plain)
      .tint(.secondary)
      ForEach(information.devices.devices, id: \.id) { device in
        Button {
          selectDevice(device)
        } label: {
          menuActionLabel(
            device.label,
            systemImage: ProfilePresentation.deviceSymbol(device.platform)
          )
        }
        .buttonStyle(.plain)
        .tint(.secondary)
      }
    } label: {
      HStack(spacing: 5) {
        deviceSelectorIcon
        Text(selectedDeviceLabel)
          .foregroundStyle(.primary)
          .lineLimit(1)
          .minimumScaleFactor(0.85)
          .layoutPriority(1)
        Image(systemName: "chevron.down")
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(.secondary)
          .fixedSize()
      }
      .frame(minWidth: 142, maxWidth: 142, minHeight: 36, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .fixedSize(horizontal: true, vertical: false)
    .accessibilityLabel(SettingsUIStrings.scope)
  }

  private var deviceSelectorIcon: some View {
    ZStack {
      deviceSelectorSymbol("globe")
      deviceSelectorSymbol("laptopcomputer")
      deviceSelectorSymbol("desktopcomputer")
      deviceSelectorSymbol("iphone")
    }
    .foregroundStyle(.secondary)
    .frame(width: 18, height: 18)
    .transaction { $0.disablesAnimations = true }
    .accessibilityHidden(true)
  }

  private func deviceSelectorSymbol(_ symbol: String) -> some View {
    Image(systemName: symbol)
      .opacity(selectedDeviceSymbol == symbol ? 1 : 0)
  }

  private func selectDevice(_ device: SettingsProfileDevice?) {
    var updatedQuery = query
    updatedQuery.scope = device == nil ? .all : .device
    updatedQuery.deviceID = device?.id

    var transaction = Transaction(animation: nil)
    transaction.disablesAnimations = true
    withTransaction(transaction) {
      query = updatedQuery
    }
  }

  private var accountMenu: some View {
    Menu {
      Button {
        query.provider = nil
      } label: {
        menuActionLabel(
          SettingsUIStrings.allAccounts,
          systemImage: "line.3.horizontal.decrease"
        )
      }
      .buttonStyle(.plain)
      .tint(.secondary)
      ForEach(information.core.availableAccounts, id: \.key) { account in
        Button {
          query.provider = account.key
        } label: {
          Text(account.label)
            .foregroundStyle(.primary)
        }
        .buttonStyle(.plain)
      }
    } label: {
      HStack(spacing: 5) {
        Image(systemName: "line.3.horizontal.decrease")
          .foregroundStyle(.secondary)
          .frame(width: 18)
          .fixedSize(horizontal: true, vertical: false)
        Text(selectedAccountLabel)
          .foregroundStyle(.primary)
          .lineLimit(1)
          .minimumScaleFactor(0.85)
          .layoutPriority(1)
        Image(systemName: "chevron.down")
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(.secondary)
          .fixedSize()
      }
      .frame(minHeight: 36)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .fixedSize(horizontal: true, vertical: false)
    .accessibilityLabel(SettingsUIStrings.account)
  }

  private func menuActionLabel(_ title: String, systemImage: String) -> some View {
    Label {
      Text(title)
        .foregroundStyle(.primary)
    } icon: {
      Image(systemName: systemImage)
        .foregroundStyle(.secondary)
    }
  }

  private var selectedDevice: SettingsProfileDevice? {
    let id = query.deviceID ?? information.devices.currentDeviceId
    return information.devices.devices.first { $0.id == id }
  }

  private var selectedDeviceLabel: String {
    query.scope == .all
      ? SettingsUIStrings.allDevices
      : (selectedDevice?.label ?? information.core.device.label)
  }

  private var selectedDeviceSymbol: String {
    query.scope == .all
      ? "globe"
      : ProfilePresentation.deviceSymbol(
        selectedDevice?.platform ?? information.core.device.platform)
  }

  private var selectedAccountLabel: String {
    guard let key = query.provider else { return SettingsUIStrings.allAccounts }
    return information.core.availableAccounts.first { $0.key == key }?.label
      ?? SettingsUIStrings.allAccounts
  }

  private var rangeAndStats: some View {
    VStack(spacing: 12) {
      Picker(SettingsUIStrings.period, selection: $query.window) {
        Text(SettingsUIStrings.sevenDaysShort).tag(SettingsProfileWindow.sevenDays)
        Text(SettingsUIStrings.thirtyDaysShort).tag(SettingsProfileWindow.thirtyDays)
        Text(SettingsUIStrings.allShort).tag(SettingsProfileWindow.all)
      }
      .pickerStyle(.segmented)
      .controlSize(.small)
      .frame(width: 180)

      ProfileStatGrid(information: information, window: query.window)

      if !information.tokens.unavailableProviders.isEmpty {
        Text(
          SettingsUIStrings.tokenUsageUnavailable(
            information.tokens.unavailableProviders
              .map(ProfilePresentation.providerLabel)
              .joined(separator: ", ")
          )
        )
        .font(.caption2)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
      }
    }
  }

  private var activity: some View {
    VStack(spacing: 12) {
      HStack {
        Text(SettingsUIStrings.activityTitle)
          .font(.subheadline.weight(.semibold))
        Spacer()
        Picker(
          SettingsUIStrings.activityTitle,
          selection: Binding(
            get: { activeMetric },
            set: { selectedMetric = $0 }
          )
        ) {
          Text(SettingsUIStrings.totalPrompts).tag(SettingsProfileHeatmapMetric.prompts)
          Text(SettingsUIStrings.tokensTitle)
            .tag(SettingsProfileHeatmapMetric.tokens)
            .disabled(!information.tokens.available)
        }
        .pickerStyle(.segmented)
        .controlSize(.small)
        .frame(width: 150)
      }

      ProfileActivityHeatmap(
        heatmap: activeMetric == .tokens
          ? information.tokens.tokenHeatmap
          : information.core.promptHeatmap
      )
    }
  }
}
