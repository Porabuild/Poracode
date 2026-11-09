import SwiftUI

/// Native two-mode selector shared by the project workspace's compact bottom
/// chrome. The floating glass tab platter preserves platform selection
/// semantics while the surrounding action strip keeps the selector centered
/// between edge actions.
struct ProjectWorkspaceModePicker: View {
  @Binding var selection: ProjectWorkspaceMode
  var glassID: String? = nil
  var glassNamespace: Namespace.ID? = nil

  var body: some View {
    PoracodeGlassTabs(
      title: ProjectWorkspaceStrings.title,
      selection: $selection,
      tabs: [
        PoracodeGlassTab(
          value: ProjectWorkspaceMode.files,
          title: ProjectWorkspaceStrings.files,
          systemImage: "folder"
        ),
        PoracodeGlassTab(
          value: ProjectWorkspaceMode.git,
          title: ProjectWorkspaceStrings.git,
          systemImage: "arrow.triangle.branch",
          accessibilityIdentifier: "native-e2e.workspace.git"
        ),
      ],
      glassID: glassID,
      glassNamespace: glassNamespace
    )
  }
}
