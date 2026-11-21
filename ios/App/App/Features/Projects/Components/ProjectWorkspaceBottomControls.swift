import SwiftUI

struct ProjectWorkspaceBottomControls: View {
  let canCreate: Bool
  @Binding var mode: ProjectWorkspaceMode
  @Binding var isSearchPresented: Bool
  @Binding var query: String
  @Binding var requestedCreationType: AdvancedProjectEntryType?
  var showsModePicker = true
  var usesSystemFileActions = false
  @Namespace private var glassNamespace

  var body: some View {
    PoracodeBottomActionStrip {
      leading
    } center: {
      center
    } trailing: {
      trailing
    }
    .poracodeAvoidKeyboard(isActive: isSearchPresented)
  }

  @ViewBuilder
  private var leading: some View {
    if !usesSystemFileActions && mode == .files {
      PoracodeCircleButton(action: toggleSearch) {
        Image(systemName: searchSymbol)
      }
      .accessibilityLabel(searchLabel)
      .accessibilityIdentifier("native-e2e.project-files.search-action")
      .poracodeGlassID("workspace.leading", in: glassNamespace)
    }
  }

  @ViewBuilder
  private var center: some View {
    if isSearchPresented && mode == .files {
      searchField.frame(maxWidth: 220)
    } else if showsModePicker {
      ProjectWorkspaceModePicker(
        selection: $mode,
        glassID: "workspace.center",
        glassNamespace: glassNamespace
      )
    }
  }

  @ViewBuilder
  private var trailing: some View {
    if !usesSystemFileActions && mode == .files {
      PoracodeCircleMenu {
        createActions
      } label: {
        Image(systemName: "plus")
      }
      .disabled(!canCreate)
      .accessibilityLabel(createTitle)
      .accessibilityIdentifier("native-e2e.project-files.create")
      .poracodeGlassID("workspace.trailing", in: glassNamespace)
    }
  }

  @ViewBuilder var sidebarSearch: some View {
    if isSearchPresented && mode == .files {
      searchField
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }
  }

  @ViewBuilder var sidebarFooter: some View {
    if showsModePicker {
      ProjectWorkspaceModePicker(selection: $mode)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
  }

  @ToolbarContentBuilder var sidebarFileToolbar: some ToolbarContent {
    ToolbarItemGroup(placement: .topBarTrailing) {
      systemSearch
      systemCreateMenu
    }
  }

  @ToolbarContentBuilder var fileToolbar: some ToolbarContent {
    ToolbarItem(placement: .bottomBar) {
      systemSearch
    }
    ToolbarItem(placement: .bottomBar) {
      systemCreateMenu
    }
  }

  private var searchField: some View {
    PoracodeBottomSearchField(text: $query, prompt: ProjectWorkspaceStrings.searchFiles)
  }

  private var systemSearch: some View {
    PoracodeToolbarIconButton(title: searchLabel, systemImage: searchSymbol, color: .primary,
      action: toggleSearch)
      .accessibilityIdentifier("native-e2e.project-files.search-action")
  }

  private var systemCreateMenu: some View {
    PoracodeToolbarMenu(title: createTitle, systemImage: "plus") {
      createActions
    }
    .disabled(!canCreate)
    .accessibilityIdentifier("native-e2e.project-files.create")
  }

  @ViewBuilder private var createActions: some View {
    Button(createLabel(.file), systemImage: "doc.badge.plus") {
      requestedCreationType = .file
    }
    Button(createLabel(.directory), systemImage: "folder.badge.plus") {
      requestedCreationType = .directory
    }
  }

  private var createTitle: String { AdvancedOperationsStrings.action(.createProjectEntry) }
  private var searchLabel: String {
    isSearchPresented ? AdvancedOperationsStrings.cancel : ProjectWorkspaceStrings.searchFiles
  }
  private var searchSymbol: String { isSearchPresented ? "xmark" : "magnifyingglass" }

  private func toggleSearch() {
    if isSearchPresented { query = "" }
    isSearchPresented.toggle()
  }

  private func createLabel(_ type: AdvancedProjectEntryType) -> String {
    let kind =
      type == .file
      ? AdvancedOperationsStrings.entryTypeFile : AdvancedOperationsStrings.entryTypeDirectory
    return "\(createTitle) · \(kind)"
  }
}
