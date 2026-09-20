import SwiftUI

struct ProjectWorkspaceSplitView<Sidebar: View, Detail: View>: View {
  @Binding private var preferredCompactColumn: NavigationSplitViewColumn
  private let sidebar: Sidebar
  private let detail: Detail

  @Environment(\.horizontalSizeClass) private var horizontalSizeClass

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
    if horizontalSizeClass == .compact {
      compactStack
    } else {
      splitView
    }
  }

  /// Compact has no sidebar column: the enclosing NavigationStack already
  /// renders the navigation bar, and nesting a NavigationSplitView here stacks
  /// a second, title-only header band under it plus its own list top inset.
  /// The sidebar therefore joins the enclosing stack directly — its
  /// `navigationTitle` lands in the real bar beside the back control — and the
  /// detail column is pushed as a destination keyed by the same column
  /// preference the split view would have consumed (`preferredCompactColumn ==
  /// .detail`, set by file/change selection, cleared by mode switches and
  /// `clearSelection()`; the back button writes `.sidebar` back through the
  /// binding).
  @ViewBuilder
  private var compactStack: some View {
    sidebar
      .navigationDestination(isPresented: showsDetail) {
        detail
      }
  }

  private var splitView: some View {
    NavigationSplitView(preferredCompactColumn: $preferredCompactColumn) {
      sidebar
    } detail: {
      detail
    }
    .navigationSplitViewStyle(.balanced)
  }

  private var showsDetail: Binding<Bool> {
    Binding(
      get: { preferredCompactColumn == .detail },
      set: { isShowing in
        guard !isShowing else { return }
        preferredCompactColumn = .sidebar
      }
    )
  }
}
