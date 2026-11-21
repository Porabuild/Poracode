import SwiftUI

/// Workspaces belong to this remote client. Filing a project changes the local
/// view across all paired hosts and never mutates a host's own workspace ids.
struct HomeWorkspaceSettingsView: View {
  @Environment(\.homeWorkspaceSelection) private var activeSelection
  @Bindable var session: AppSession
  @AppStorage(HomeWorkspacePreferences.storageKey) private var storage = ""
  @State private var editor: HomeWorkspace?
  @State private var editorName = ""
  @State private var showingEditor = false
  @State private var deletion: HomeWorkspace?

  private var preferences: HomeWorkspacePreferences { .init(stored: storage) }
  private var projects: [HomeProjectFilterOption] {
    session.homeProjectOptions.filter { $0.project.id != RemoteProject.homeScopeID }
  }
  private var homeThreads: [UnifiedThreadListItem] {
    UnifiedThreadPresentation.entries(hosts: session.state.hosts, selectedConnectionID: session.selectedConnectionId,
      selectedSnapshot: session.snapshot, hostSnapshots: session.state.hostSnapshots)
      .filter { $0.project.id == RemoteProject.homeScopeID }
  }

  var body: some View {
    List {
      Section(HomeStrings.workspaces) {
        ForEach(preferences.workspaces) { workspace in
          workspaceRow(workspace)
        }
      }
      Section(ProjectManagementStrings.title) {
        ForEach(projects) { option in
          filingRow(title: option.project.name, host: option.host, selection: Binding(
            get: { preferences.workspace(forProject: option.identity.id.rawValue) ?? "" },
            set: { id in update { $0.assignProject(option.identity.id.rawValue, to: id.isEmpty ? nil : id) } }
          ))
        }
      }
      if !homeThreads.isEmpty {
        Section(SettingsUIStrings.totalThreads) {
          ForEach(homeThreads) { item in
            filingRow(title: item.thread.title, host: item.hostName, selection: Binding(
              get: { preferences.workspace(forThread: item.id) ?? "" },
              set: { id in update { $0.assignThread(item.id, to: id.isEmpty ? nil : id) } }
            ))
          }
        }
      }
    }
    .disabled(!preferences.canEdit)
    .poracodeDrawerListStyle()
    .poracodeReadableListMargins(760)
    .navigationTitle(HomeStrings.workspaces)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .bottomBar) {
        Button(HomeStrings.addWorkspace, systemImage: "plus") { edit(nil) }
          .disabled(!preferences.canEdit)
          .accessibilityIdentifier("native-e2e.workspaces.add")
      }
    }
    .alert(editor == nil ? HomeStrings.addWorkspace : ThreadLifecycleStrings.rename, isPresented: $showingEditor) {
      TextField(HomeStrings.workspaceName, text: $editorName)
      Button(SettingsUIStrings.cancel, role: .cancel) {}
      Button(SettingsUIStrings.save, action: saveWorkspace)
      .disabled(editorName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
    .confirmationDialog(HomeStrings.deleteWorkspace,
      isPresented: Binding(get: { deletion != nil }, set: { if !$0 { deletion = nil } }),
      presenting: deletion
    ) { workspace in
      Button(HomeStrings.deleteWorkspace, role: .destructive) { remove(workspace) }
      Button(SettingsUIStrings.cancel, role: .cancel) { deletion = nil }
    } message: { _ in Text(HomeStrings.deleteWorkspaceMessage) }
  }

  private func workspaceRow(_ workspace: HomeWorkspace) -> some View {
    let isActive = preferences.activeID(stored: activeSelection?.wrappedValue ?? "") == workspace.id
    return HStack(spacing: 8) {
      Button { edit(workspace) } label: {
        HStack {
          Label(workspace.name, systemImage: workspace.systemImage)
          Spacer(minLength: 8)
          if isActive {
            Image(systemName: "checkmark")
              .foregroundStyle(.secondary)
              .accessibilityHidden(true)
          }
        }
        .foregroundStyle(.primary)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("native-e2e.workspaces.row.\(workspace.id)")
      .accessibilityAddTraits(isActive ? .isSelected : [])
      .contextMenu { workspaceActions(workspace) }

      Menu {
        workspaceActions(workspace)
      } label: {
        Label(HomeStrings.manageWorkspaces, systemImage: "ellipsis")
          .labelStyle(.iconOnly)
          .foregroundStyle(.secondary)
          .frame(minWidth: 44, minHeight: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.borderless)
      .accessibilityValue(workspace.name)
      .accessibilityIdentifier("native-e2e.workspaces.actions.\(workspace.id)")
    }
  }

  @ViewBuilder
  private func workspaceActions(_ workspace: HomeWorkspace) -> some View {
    Button(ThreadLifecycleStrings.rename, systemImage: "pencil") { edit(workspace) }
    Button(HomeStrings.deleteWorkspace, systemImage: "trash", role: .destructive) { deletion = workspace }
      .disabled(preferences.workspaces.count <= 1)
  }

  private func filingRow(title: String, host: String, selection: Binding<String>) -> some View {
    HStack {
      VStack(alignment: .leading, spacing: 3) {
        Text(title).foregroundStyle(.primary)
        Text(HomeDeviceName.display(host)).font(.caption).foregroundStyle(.secondary)
      }
      Spacer(minLength: 8)
      Picker(HomeStrings.workspace, selection: selection) {
        Text(HomeStrings.unfiled).tag("")
        ForEach(preferences.workspaces) { workspace in Text(workspace.name).tag(workspace.id) }
      }
      .labelsHidden()
      .pickerStyle(.menu)
      .tint(.primary)
      .accessibilityLabel("\(title), \(HomeDeviceName.display(host)), \(HomeStrings.workspace)")
    }
    .frame(minHeight: 44)
  }

  private func edit(_ workspace: HomeWorkspace?) {
    editor = workspace
    editorName = workspace?.name ?? ""
    showingEditor = true
  }

  private func saveWorkspace() {
    if let editor {
      update { $0.rename(editor.id, to: editorName) }
    } else {
      var value = preferences
      guard let id = value.add(name: editorName) else { return }
      storage = value.encoded
      activeSelection?.wrappedValue = id
    }
  }

  private func remove(_ workspace: HomeWorkspace) {
    update { $0.remove(workspace.id) }
    if activeSelection?.wrappedValue == workspace.id {
      activeSelection?.wrappedValue = preferences.workspaces.first?.id ?? ""
    }
    deletion = nil
  }

  private func update(_ edit: (inout HomeWorkspacePreferences) -> Void) {
    var value = preferences
    edit(&value)
    storage = value.encoded
  }
}
