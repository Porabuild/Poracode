import SwiftUI

/// Projects normalized transcript entries into the small reusable item
/// components. Scroll ownership remains in `RichChatTimelineView`; this layer
/// owns only hierarchy, indentation, and activity grouping.
struct RichChatTimelineEntryView: View {
  let entry: RichTimelineEntry
  let mediaController: RichChatMediaController
  let actions: RichChatTimelineActions

  var body: some View {
    switch entry {
    case .item(let node):
      RichChatTimelineNodeView(
        node: node,
        mediaController: mediaController,
        actions: actions,
        depth: 0
      )
    case .group(let stableID, let members):
      RichChatTimelineGroupView(
        stableID: stableID,
        members: members,
        mediaController: mediaController,
        actions: actions
      )
    }
  }
}

private struct RichChatTimelineGroupView: View {
  let stableID: String
  let members: [RichVisibleTimelineNode]
  let mediaController: RichChatMediaController
  let actions: RichChatTimelineActions

  @State private var expanded = false

  private var summary: RichChatActivityGroupSummary {
    RichChatActivityGroupSummary(members: members)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button(action: toggleExpanded) {
        HStack(spacing: 6) {
          RichChatActivityGroupSummaryView(summary: summary)
          Image(systemName: "chevron.down")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(.tertiary)
            .rotationEffect(.degrees(expanded ? 180 : 0))
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(
        "\(expanded ? RichChatStrings.collapseActivity : RichChatStrings.expandActivity), \(RichChatStrings.activityCount(members.count))"
      )

      if expanded {
        VStack(alignment: .leading, spacing: 6) {
          ForEach(members, id: \.item.id) { member in
            RichChatTimelineNodeView(
              node: member,
              mediaController: mediaController,
              actions: actions,
              depth: 0
            )
          }
        }
        .padding(.leading, 12)
        .overlay(alignment: .leading) {
          Rectangle()
            .fill(.quaternary)
            .frame(width: 1)
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .padding(.leading, 10)
    .padding(.bottom, 8)
  }

  private func toggleExpanded() {
    withAnimation(.snappy(duration: 0.22)) { expanded.toggle() }
  }
}

struct RichChatActivityGroupSummary: Equatable {
  let activityCount: Int
  let reasoningCount: Int

  init(members: [RichVisibleTimelineNode]) {
    reasoningCount = members.count { $0.item.type == RichItemType.reasoning }
    activityCount = members.count - reasoningCount
  }
}

private struct RichChatActivityGroupSummaryView: View {
  let summary: RichChatActivityGroupSummary

  var body: some View {
    HStack(spacing: 5) {
      if summary.activityCount > 0 {
        segment(
          summary.activityCount,
          label: RichChatStrings.tool,
          systemImage: "wrench.and.screwdriver"
        )
      }
      if summary.activityCount > 0, summary.reasoningCount > 0 {
        Text("·")
          .foregroundStyle(.quaternary)
      }
      if summary.reasoningCount > 0 {
        segment(
          summary.reasoningCount,
          label: RichChatStrings.thought,
          systemImage: "brain.head.profile"
        )
      }
    }
    .poracodeChatText(.metadata, weight: .medium)
    .foregroundStyle(.secondary)
  }

  private func segment(_ count: Int, label: String, systemImage: String) -> some View {
    Label {
      Text("\(count.formatted()) \(label.lowercased(with: .current))")
    } icon: {
      Image(systemName: systemImage)
    }
  }
}

private struct RichChatTimelineNodeView: View {
  let node: RichVisibleTimelineNode
  let mediaController: RichChatMediaController
  let actions: RichChatTimelineActions
  let depth: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      RichChatTranscriptItemView(
        item: node.item,
        mediaController: mediaController,
        actions: actions
      )
      ForEach(node.children, id: \.stableID) { child in
        switch child {
        case .item(let childNode):
          RichChatTimelineNodeView(
            node: childNode,
            mediaController: mediaController,
            actions: actions,
            depth: depth + 1
          )
        case .group(let stableID, let members):
          RichChatTimelineGroupView(
            stableID: stableID,
            members: members,
            mediaController: mediaController,
            actions: actions
          )
          .padding(.leading, 12)
        }
      }
    }
    .padding(.leading, depth == 0 ? 0 : 12)
  }
}
