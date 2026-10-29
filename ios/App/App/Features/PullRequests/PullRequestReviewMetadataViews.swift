import SwiftUI

/// A host label as a compact chip. A valid hex color tints the chip; anything else stays neutral.
struct PullRequestLabelChip: View {
  let label: GitHubReviewLabel

  var body: some View {
    let tint =
      label.rgb.map { Color(red: $0.red, green: $0.green, blue: $0.blue) } ?? Color.secondary
    Text(verbatim: label.name)
      .font(.caption2.weight(.medium))
      .foregroundStyle(.primary)
      .lineLimit(1)
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .background(tint.opacity(0.22), in: Capsule())
      .overlay(Capsule().strokeBorder(tint.opacity(0.55), lineWidth: 1))
  }
}

/// Wrapping row of label chips; `limit` keeps list rows short and counts the rest.
struct PullRequestLabelFlow: View {
  let labels: [GitHubReviewLabel]
  var limit: Int? = nil

  var body: some View {
    let shown = limit.map { Array(labels.prefix($0)) } ?? labels
    PullRequestLabelFlowLayout(spacing: 6) {
      ForEach(shown) { label in
        PullRequestLabelChip(label: label)
      }
      if shown.count < labels.count {
        Text(PullRequestsStrings.moreLabels(Int64(labels.count - shown.count)))
          .font(.caption2.monospacedDigit())
          .foregroundStyle(.secondary)
      }
    }
  }
}

struct PullRequestLabelFlowLayout: Layout {
  var spacing: CGFloat = 6

  func sizeThatFits(
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) -> CGSize {
    arranged(width: proposal.width ?? .infinity, subviews: subviews).size
  }

  func placeSubviews(
    in bounds: CGRect,
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) {
    let layout = arranged(width: bounds.width, subviews: subviews)
    for (index, origin) in layout.origins.enumerated() {
      subviews[index].place(
        at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y),
        proposal: .unspecified
      )
    }
  }

  private func arranged(width: CGFloat, subviews: Subviews) -> (size: CGSize, origins: [CGPoint]) {
    var origins: [CGPoint] = []
    var x: CGFloat = 0
    var y: CGFloat = 0
    var rowHeight: CGFloat = 0
    var widest: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > width {
        x = 0
        y += rowHeight + spacing
        rowHeight = 0
      }
      origins.append(CGPoint(x: x, y: y))
      x += size.width
      widest = max(widest, x)
      x += spacing
      rowHeight = max(rowHeight, size.height)
    }
    return (CGSize(width: widest, height: y + rowHeight), origins)
  }
}

struct PullRequestReviewerRow: View {
  let reviewer: GitHubReviewerSummary

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: reviewer.isTeam ? "person.2" : "person.crop.circle")
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: reviewer.displayName)
        if reviewer.displayName != reviewer.login {
          Text(verbatim: reviewer.login)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
      if reviewer.isTeam {
        Spacer(minLength: 8)
        Text(PullRequestsStrings.team)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .padding(.horizontal, 6)
          .padding(.vertical, 2)
          .background(Color.secondary.opacity(0.15), in: Capsule())
      }
    }
    .accessibilityElement(children: .combine)
  }
}

/// Outstanding review requests, shown beside the review verdicts. A team request is marked.
struct PullRequestRequestedReviewersSection: View {
  let reviewers: [GitHubReviewerSummary]

  var body: some View {
    Section(PullRequestsStrings.requestedReviewers) {
      ForEach(reviewers) { reviewer in
        PullRequestReviewerRow(reviewer: reviewer)
      }
    }
  }
}

/// Lifecycle and metadata events. Each row shows the actor when the host names one, and the time.
struct PullRequestTimelineSection: View {
  let events: [PullRequestTimelineEvent]

  var body: some View {
    Section(PullRequestsStrings.timeline) {
      ForEach(events) { event in
        if let text = PullRequestsStrings.timelineText(event) {
          HStack(alignment: .top, spacing: 10) {
            Image(systemName: event.kind.symbol)
              .foregroundStyle(.secondary)
              .frame(width: 22)
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: text)
              if let detail = detail(event) {
                Text(verbatim: detail)
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
            }
          }
          .accessibilityElement(children: .combine)
        }
      }
    }
  }

  private func detail(_ event: PullRequestTimelineEvent) -> String? {
    let parts = [event.actor?.login, PullRequestTimelineTime.relative(event.createdAt)]
      .compactMap(\.self)
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }
}
