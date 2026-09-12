import SwiftUI

/// Native two-mode selector shared by the project workspace's compact bottom
/// chrome. A segmented picker preserves platform selection semantics while the
/// surrounding action strip keeps the selector centered between edge actions.
struct ProjectWorkspaceModePicker: View {
  @Binding var selection: ProjectWorkspaceMode

  var body: some View {
    Picker(ProjectWorkspaceStrings.title, selection: $selection) {
      Label(ProjectWorkspaceStrings.files, systemImage: "folder")
        .tag(ProjectWorkspaceMode.files)
      Label(ProjectWorkspaceStrings.git, systemImage: "arrow.triangle.branch")
        .tag(ProjectWorkspaceMode.git)
    }
    .pickerStyle(.segmented)
    .controlSize(.large)
    .labelsHidden()
    .frame(maxWidth: 190, minHeight: 44, maxHeight: 44)
  }
}
