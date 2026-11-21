import SwiftUI
import UIKit

struct SettingsModelVisibilityView: View {
  @Environment(\.dismiss) private var dismiss
  let catalog: ModelVisibilityCatalog
  @State var controller: SettingsModelVisibilityController
  @State private var search = ""
  @FocusState private var searchFocused: Bool
  @State private var selectedSurfaces: [String: String] = [:]

  var body: some View {
    let hidden = catalog.effectiveHidden(saved: controller.composition.document.document?.hiddenModels ?? [:])
    let groups = catalog.groups.filter { $0.rows.contains { $0.matches(search) } }
    let count = ModelVisibilityStrings.count(ModelVisibilityCatalog.visibleCount(catalog.rows, hidden: hidden), total: catalog.rows.count)
    NavigationStack {
      List {
        Section {
          if search.isEmpty {
            LabeledContent(SettingsUIStrings.visibleModels) { countLabel(count) }
          } else {
            HStack(alignment: .firstTextBaseline) {
              Text(SettingsUIStrings.visibleModels)
              Spacer(minLength: 8)
              countLabel(count)
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
          }
          if let failure = controller.composition.gate(.sessionOperate) {
            Text(SettingsUIStrings.failure(failure)).font(.footnote).foregroundStyle(.secondary)
          }
        } footer: {
          if search.isEmpty { Text(ModelVisibilityStrings.hint) }
        }
        ForEach(groups) { group in
          groupSection(group, hidden: hidden)
        }
        if !groups.contains(where: { rows(in: $0).contains { $0.matches(search) } }) {
          ContentUnavailableView.search(text: search)
            .listRowBackground(Color.clear)
        }
      }
      .accessibilityIdentifier("native-e2e.settings.models.list")
      .poracodeDrawerListStyle()
      .poracodeReadableListMargins(740)
      .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always),
        prompt: Text(ModelVisibilityStrings.search))
      .modifier(ModelVisibilitySearchFocus(focus: $searchFocused))
      .navigationTitle(SettingsUIStrings.visibleModels)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(SettingsUIStrings.done, systemImage: "checkmark") { dismiss() }
            .accessibilityIdentifier("native-e2e.settings.models.done")
        }
        // The centered iPad sheet's bottom bar can be covered by the keyboard.
        ToolbarItem(placement: searchFocused && UIDevice.current.userInterfaceIdiom == .pad
          ? .topBarLeading : .bottomBar) {
          PoracodeToolbarMenu(
            title: controller.isSaving ? SettingsUIStrings.saving : ModelVisibilityStrings.actions,
            systemImage: controller.isSaving ? "hourglass" : "eye"
          ) {
            Button(ModelVisibilityStrings.showAll, systemImage: "eye") { setAll(visible: true) }
            Button(ModelVisibilityStrings.hideAll, systemImage: "eye.slash") { setAll(visible: false) }
          }
          .disabled(!controller.canEdit)
          .accessibilityIdentifier("native-e2e.settings.models.actions")
        }
      }
      .poracodeUseKeyboardLayoutGuide()
      .overlay(alignment: .bottom) {
        if controller.composition.mutationFailure != nil || controller.composition.mutationNotice == .ambiguousRefreshFailed {
          SettingsMutationBanner(notice: controller.composition.mutationNotice,
            failure: controller.composition.mutationFailure, dismiss: controller.composition.clearMutationFeedback)
            .padding()
        }
      }
      .onChange(of: controller.isCurrent) { _, current in if !current { dismiss() } }
    }
  }

  private func rows(in group: ModelVisibilityGroup) -> [ModelVisibilityRow] {
    selectedSurfaces[group.id].flatMap { id in group.surfaces.first { $0.id == id } }?.rows ?? group.rows
  }

  private func countLabel(_ count: String) -> some View {
    Text(count).monospacedDigit().accessibilityIdentifier("native-e2e.settings.models.count")
  }

  @ViewBuilder private func groupSection(_ group: ModelVisibilityGroup, hidden: [String: Set<String>]) -> some View {
    let rows = rows(in: group).filter { $0.matches(search) }
    Section {
      selectionRow(group.label, rows: rows, hidden: hidden, identifier: "provider.\(group.id)", isGroup: true) {
        HomeProviderIcon(kind: group.id, agentLabel: group.label).frame(width: 22, height: 22)
      } detail: { EmptyView() }
      if group.surfaces.count > 1 {
        Picker(ModelVisibilityStrings.surface, selection: Binding(
          get: { selectedSurfaces[group.id] ?? "" }, set: { selectedSurfaces[group.id] = $0 }
        )) {
          Text(ModelVisibilityStrings.allSurfaces).tag("")
          ForEach(group.surfaces) { Text($0.label).tag($0.id) }
        }
        // Present the choices in the sheet's navigation stack while search is active.
        .pickerStyle(.navigationLink)
        .accessibilityIdentifier("native-e2e.settings.models.surface.\(group.id)")
      }
      ForEach(rows) { row in
        selectionRow(row.label, rows: [row], hidden: hidden, identifier: "row.\(row.id)") {
          EmptyView()
        } detail: {
          let hints = [row.groupLabel, row.detail].compactMap { $0 } + row.badges
          if !hints.isEmpty {
            Text(hints.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
          }
        }
      }
    }
  }

  private func selectionRow<Icon: View, Detail: View>(_ label: String, rows: [ModelVisibilityRow],
    hidden: [String: Set<String>], identifier: String, isGroup: Bool = false,
    @ViewBuilder icon: () -> Icon, @ViewBuilder detail: () -> Detail) -> some View {
    let state = ModelVisibilityCatalog.state(rows, hidden: hidden)
    return Button {
      controller.setHidden(ModelVisibilityCatalog.toggling(rows, visible: state != .all, hidden: hidden))
    } label: {
      HStack(spacing: 12) {
        Image(systemName: state == .all ? "checkmark.circle.fill" : state == .some ? "minus.circle.fill" : "circle")
          .font(.title3).foregroundStyle(state == .none ? .secondary : .primary)
          .accessibilityHidden(true)
        icon().foregroundStyle(.secondary).accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 3) {
          Text(label).foregroundStyle(.primary).fixedSize(horizontal: false, vertical: true)
          detail()
        }
        Spacer(minLength: 4)
        if rows.count > 1 {
          Text(ModelVisibilityStrings.count(ModelVisibilityCatalog.visibleCount(rows, hidden: hidden), total: rows.count))
            .font(.caption).foregroundStyle(.secondary).monospacedDigit()
        }
      }
      .frame(minHeight: 44)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(!controller.canEdit || rows.isEmpty)
    .accessibilityElement(children: .combine)
    .accessibilityValue(ModelVisibilityStrings.state(state, isGroup: isGroup))
    .accessibilityIdentifier("native-e2e.settings.models.\(identifier)")
  }

  private func setAll(visible: Bool) { controller.setHidden(catalog.settingAll(visible: visible)) }
}

private struct ModelVisibilitySearchFocus: ViewModifier {
  let focus: FocusState<Bool>.Binding

  func body(content: Content) -> some View {
    if #available(iOS 18.0, *) {
      content.searchFocused(focus)
    } else {
      content
    }
  }
}
