import SwiftUI

struct HomeWorkspacePicker: View {
  let workspaces: [HomeWorkspace]
  @Binding var selection: String
  let manage: () -> Void

  var body: some View {
    if workspaces.count > 1, let active = workspaces.first(where: { $0.id == selection }) ?? workspaces.first {
      Menu {
        ForEach(workspaces) { workspace in
          Button { selection = workspace.id } label: {
            Label(workspace.name, systemImage: workspace.id == active.id ? "checkmark" : workspace.systemImage)
          }
        }
        Divider()
        Button(HomeStrings.manageWorkspaces, systemImage: "square.stack.3d.up", action: manage)
      } label: {
        HStack(spacing: 8) {
          Image(systemName: active.systemImage).foregroundStyle(.secondary)
          Text(active.name).font(.footnote.weight(.medium)).lineLimit(1)
          Spacer(minLength: 4)
          Image(systemName: "chevron.up.chevron.down").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 44)
        .contentShape(Capsule())
        .poracodeGlassBackground(in: Capsule(), interactive: true)
      }
      .buttonStyle(.plain)
      .tint(.secondary)
      .accessibilityLabel(HomeStrings.switchWorkspace)
      .accessibilityValue(active.name)
      .accessibilityIdentifier("native-e2e.sidebar.workspaces")
    }
  }
}
