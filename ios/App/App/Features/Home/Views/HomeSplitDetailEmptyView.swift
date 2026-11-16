import SwiftUI

/// Right-hand workspace home shown in split layouts before a thread or project
/// is selected, scaling from a clean compact empty card up to a touch-first
/// Desktop-aligned Projects + Recent Threads overview on iPad and unfolded Duo.
struct HomeSplitDetailEmptyView: View {
  let canStartTask: Bool
  let isCompactHeight: Bool
  let workspace: HomeWorkspace?
  let projects: [HomeProjectFilterOption]
  let recentThreads: [UnifiedThreadListItem]
  let gitSummary: (UnifiedThreadListItem) -> GitThreadSummary?
  let agentLabel: (UnifiedThreadListItem) -> String?
  let isOnline: (ClientConnectionID) -> Bool
  let hasDraft: (UnifiedThreadListItem) -> Bool
  let startNewTask: () -> Void
  let startTaskInProject: (HomeProjectFilterOption) -> Void
  let openProject: (HomeProjectFilterOption) -> Void
  let openThread: (UnifiedThreadListItem) -> Void
  var hasBackgroundActivity: (UnifiedThreadListItem) -> Bool = { _ in false }

  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var theme

  private var palette: PoracodeThemeVariant {
    theme.variant(for: colorScheme)
  }

  var body: some View {
    GeometryReader { proxy in
      ScrollView {
        if !isCompactHeight && proxy.size.width >= 560 && (!projects.isEmpty || !recentThreads.isEmpty) {
          workspaceHome(width: proxy.size.width)
            .frame(maxWidth: .infinity, minHeight: proxy.size.height, alignment: .top)
        } else {
          compactEmptyCard
            .padding(24)
            .frame(maxWidth: .infinity)
            .frame(minHeight: proxy.size.height)
        }
      }
      .scrollBounceBehavior(.basedOnSize)
    }
    .poracodeThemeBackground(palette.background)
  }

  private var compactEmptyCard: some View {
    VStack(spacing: 14) {
      Image(systemName: "bubble.left.and.bubble.right")
        .font(.system(size: 32, weight: .regular))
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)

      VStack(spacing: 6) {
        Text(HomeStrings.splitEmptyTitle)
          .font(.title3.weight(.semibold))
          .foregroundStyle(.primary)
          .multilineTextAlignment(.center)
        Text(HomeStrings.splitEmptyDescription)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
          .frame(maxWidth: 320)
      }

      newTaskButton
        .padding(.top, 4)
    }
  }

  private func workspaceHome(width: CGFloat) -> some View {
    let usesTwoColumns = width >= 760 && !projects.isEmpty && !recentThreads.isEmpty
    return VStack(alignment: .leading, spacing: 20) {
      HStack(alignment: .center, spacing: 12) {
        VStack(alignment: .leading, spacing: 4) {
          Text(workspace?.name ?? HomeStrings.splitEmptyTitle)
            .font(.title2.weight(.semibold))
            .foregroundStyle(.primary)
          Text(HomeStrings.splitEmptyDescription)
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        Spacer(minLength: 12)
        newTaskButton
      }

      if usesTwoColumns {
        HStack(alignment: .top, spacing: 20) {
          projectsSection
            .frame(maxWidth: .infinity, alignment: .topLeading)
          recentThreadsSection
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
      } else {
        if !projects.isEmpty {
          projectsSection
        }
        if !recentThreads.isEmpty {
          recentThreadsSection
        }
      }
    }
    .frame(maxWidth: 900, alignment: .leading)
    .padding(.horizontal, 28)
    .padding(.vertical, 24)
    .frame(maxWidth: .infinity, alignment: .center)
  }

  private var newTaskButton: some View {
    Button(action: startNewTask) {
      Label(HomeStrings.newThread, systemImage: "square.and.pencil")
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(palette.background)
        .padding(.horizontal, 18)
        .frame(minHeight: 44)
        .background(Color.primary, in: Capsule())
    }
    .buttonStyle(.plain)
    .disabled(!canStartTask)
    .opacity(canStartTask ? 1 : 0.45)
    .accessibilityLabel(HomeStrings.newThread)
    .accessibilityIdentifier("native-e2e.split-empty-new-task")
  }

  private var projectsSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(ProjectManagementStrings.title)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 4)

      VStack(spacing: 6) {
        ForEach(projects.prefix(8)) { option in
          HStack(spacing: 10) {
            Button {
              openProject(option)
            } label: {
              HStack(spacing: 10) {
                Image(systemName: "folder")
                  .font(.subheadline)
                  .foregroundStyle(.secondary)
                  .frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                  Text(option.project.name)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                  Text(HomeStrings.threadCount(option.threadCount))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                }
                Spacer(minLength: 4)
              }
              .frame(minHeight: 44, alignment: .leading)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button {
              startTaskInProject(option)
            } label: {
              Image(systemName: "plus")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 34, height: 34)
                .background(palette.background.opacity(0.65), in: Circle())
                .frame(width: 44, height: 44)
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(!canStartTask)
            .opacity(canStartTask ? 1 : 0.4)
            .accessibilityLabel(HomeStrings.newThread)
          }
          .padding(.leading, 12)
          .padding(.trailing, 6)
          .padding(.vertical, 4)
          .background(palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
          .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
              .stroke(palette.border.opacity(0.35), lineWidth: 0.75)
          )
        }
      }
    }
  }

  private var recentThreadsSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(HomeStrings.recentThreads)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 4)

      VStack(spacing: 6) {
        ForEach(recentThreads.prefix(8)) { item in
          Button {
            openThread(item)
          } label: {
            PoracodeThreadRow(
              thread: item.thread,
              projectName: item.project.name,
              hostName: item.hostName,
              hostIsOnline: isOnline(item.connectionID),
              gitSummary: gitSummary(item),
              agentLabel: agentLabel(item),
              hasDraft: hasDraft(item),
              showsRelativeTime: true,
              hasBackgroundActivity: hasBackgroundActivity(item)
            )
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
          }
          .buttonStyle(HomeThreadButtonStyle(surface: palette.surface))
          .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
              .stroke(palette.border.opacity(0.35), lineWidth: 0.75)
          )
        }
      }
    }
  }
}

struct HomeSplitComposeOverlay<ComposeContent: View>: View {
  let isCompactHeight: Bool
  let dismiss: () -> Void
  @ViewBuilder let composeContent: () -> ComposeContent

  var body: some View {
    GeometryReader { proxy in
      ZStack {
        Color.black.opacity(0.28)
          .ignoresSafeArea()
          .contentShape(Rectangle())
          .onTapGesture(perform: dismiss)

        VStack(spacing: 0) {
          Spacer(minLength: 0)
          composeContent()
            .frame(maxWidth: 760, maxHeight: max(0, min(320, proxy.size.height - (isCompactHeight ? 8 : 48))))
            .contentShape(Rectangle())
            .padding(.horizontal, 16)
            .padding(.vertical, isCompactHeight ? 4 : 24)
          if !isCompactHeight {
            Spacer(minLength: 0)
          }
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: proxy.size.height)
      }
    }
    .transition(.opacity.combined(with: .scale(scale: 0.98)))
  }
}
