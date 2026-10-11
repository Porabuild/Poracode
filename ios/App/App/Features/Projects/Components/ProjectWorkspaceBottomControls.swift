import SwiftUI

struct ProjectWorkspaceBottomControls: View {
  let canCreate: Bool
  @Binding var mode: ProjectWorkspaceMode
  @Binding var isSearchPresented: Bool
  @Binding var query: String
  @Binding var requestedCreationType: AdvancedProjectEntryType?

  @ViewBuilder
  var body: some View {
    if isSearchPresented {
      PoracodeBottomActionStrip {
        PoracodeCircleButton {
          query = ""
          isSearchPresented = false
        } label: {
          Image(systemName: "xmark")
        }
        .accessibilityLabel(AdvancedOperationsStrings.cancel)
      } center: {
        PoracodeBottomSearchField(
          text: $query,
          prompt: ProjectWorkspaceStrings.searchFiles
        )
        .frame(maxWidth: 220)
      } trailing: {
        createMenu
      }
    } else {
      PoracodeBottomActionStrip {
        if mode == .files {
          PoracodeCircleButton {
            isSearchPresented = true
          } label: {
            Image(systemName: "magnifyingglass")
          }
          .accessibilityLabel(ProjectWorkspaceStrings.searchFiles)
        }
      } center: {
        ProjectWorkspaceModePicker(selection: $mode)
      } trailing: {
        if mode == .files {
          createMenu
        }
      }
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
