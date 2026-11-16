import SwiftUI

struct ProjectWorkspaceBottomControls: View {
  let canCreate: Bool
  @Binding var mode: ProjectWorkspaceMode
  @Binding var isSearchPresented: Bool
  @Binding var query: String
  @Binding var requestedCreationType: AdvancedProjectEntryType?
  @Namespace private var glassNamespace

  var body: some View {
    PoracodeBottomActionStrip {
      leading
    } center: {
      center
    } trailing: {
      trailing
    }
  }

  @ViewBuilder
  private var leading: some View {
    if isSearchPresented {
      PoracodeCircleButton {
        query = ""
        isSearchPresented = false
      } label: {
        Image(systemName: "xmark")
      }
      .accessibilityLabel(AdvancedOperationsStrings.cancel)
      .poracodeGlassID("workspace.leading", in: glassNamespace)
    } else if mode == .files {
      PoracodeCircleButton {
        isSearchPresented = true
      } label: {
        Image(systemName: "magnifyingglass")
      }
      .accessibilityLabel(ProjectWorkspaceStrings.searchFiles)
      .poracodeGlassID("workspace.leading", in: glassNamespace)
    }
  }

  @ViewBuilder
  private var center: some View {
    if isSearchPresented {
      PoracodeBottomSearchField(
        text: $query,
        prompt: ProjectWorkspaceStrings.searchFiles
      )
      .frame(maxWidth: 220)
      .poracodeGlassID("workspace.center", in: glassNamespace)
    } else {
      ProjectWorkspaceModePicker(
        selection: $mode,
        glassID: "workspace.center",
        glassNamespace: glassNamespace
      )
    }
  }

  @ViewBuilder
  private var trailing: some View {
    if isSearchPresented || mode == .files {
      createMenu
        .poracodeGlassID("workspace.trailing", in: glassNamespace)
    }
  }

  private var createMenu: some View {
    PoracodeCircleMenu {
      Button(createLabel(.file), systemImage: "doc.badge.plus") {
        requestedCreationType = .file
      }
      Button(createLabel(.directory), systemImage: "folder.badge.plus") {
        requestedCreationType = .directory
      }
    } label: {
      Image(systemName: "plus")
    }
    .disabled(!canCreate)
    .accessibilityLabel(AdvancedOperationsStrings.action(.createProjectEntry))
    .accessibilityIdentifier("native-e2e.project-files.create")
  }

  private func createLabel(_ type: AdvancedProjectEntryType) -> String {
    let kind =
      type == .file
      ? AdvancedOperationsStrings.entryTypeFile : AdvancedOperationsStrings.entryTypeDirectory
    return "\(AdvancedOperationsStrings.action(.createProjectEntry)) · \(kind)"
  }
}
