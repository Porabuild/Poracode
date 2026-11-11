import SwiftUI

struct HomeAllProjectsFilterRow: View {
  let isSelected: Bool
  let select: () -> Void

  var body: some View {
    Button(action: select) {
      HStack(spacing: 12) {
        Image(systemName: "square.grid.2x2")
          .foregroundStyle(.secondary)
          .frame(width: 22)
        Text(HomeStrings.allProjects)
          .font(.subheadline)
        Spacer(minLength: 12)
        if isSelected {
          Image(systemName: "checkmark")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.primary)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .poracodeDrawerRowSurface()
  }
}

struct HomeProjectFilterRow: View {
  let option: HomeProjectFilterOption
  let isSelected: Bool
  let select: () -> Void
  let openActions: () -> Void

  var body: some View {
    HStack(spacing: 8) {
      Button(action: select) {
        HStack(spacing: 12) {
          Image(systemName: "server.rack")
            .foregroundStyle(.secondary)
            .frame(width: 22)
          projectIdentity
          Spacer(minLength: 8)
          if isSelected {
            Image(systemName: "checkmark")
              .font(.caption.weight(.semibold))
              .foregroundStyle(.primary)
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .poracodeDrawerRowSurface()
    .accessibilityIdentifier("native-e2e.project-actions.\(option.id)")
    .simultaneousGesture(
      LongPressGesture(minimumDuration: 0.5).onEnded { _ in openActions() }
    )
    .accessibilityActions {
      Button(ProjectManagementStrings.title) { openActions() }
    }
  }

  private var projectIdentity: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(option.project.name)
        .font(.subheadline)
        .foregroundStyle(.primary)
        .lineLimit(1)
      HStack(spacing: 5) {
        Circle()
          .fill(option.online ? Color.green : Color.secondary)
          .frame(width: 6, height: 6)
          .accessibilityHidden(true)
        Text(option.host)
        Text("•")
          .accessibilityHidden(true)
        Text(HomeStrings.threadCount(option.threadCount))
      }
      .font(.caption2)
      .foregroundStyle(.secondary)
      .lineLimit(1)
    }
  }
}

typealias HomeProjectActionLabel = PoracodeActionLabel
