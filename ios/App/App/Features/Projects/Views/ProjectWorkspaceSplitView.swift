import SwiftUI

struct ProjectWorkspaceSplitView<Sidebar: View, Detail: View>: View {
  @Binding private var preferredCompactColumn: NavigationSplitViewColumn
  private let sidebar: Sidebar
  private let detail: Detail

  init(
    preferredCompactColumn: Binding<NavigationSplitViewColumn>,
    @ViewBuilder sidebar: () -> Sidebar,
    @ViewBuilder detail: () -> Detail
  ) {
    _preferredCompactColumn = preferredCompactColumn
    self.sidebar = sidebar()
    self.detail = detail()
  }

  var body: some View {
    NavigationSplitView(preferredCompactColumn: $preferredCompactColumn) {
      sidebar
    } detail: {
      detail
    }
    .navigationSplitViewStyle(.balanced)
  }
}
