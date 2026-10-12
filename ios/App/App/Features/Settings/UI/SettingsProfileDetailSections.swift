import SwiftUI

struct ProfileUsageSection: View {
  let title: String
  let emptyText: String
  let items: [SettingsProfileSkillUsage]

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ProfileSectionHeading(title)
      if items.isEmpty {
        Text(emptyText)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .padding(.vertical, 9)
      } else {
        ForEach(Array(items.enumerated()), id: \.element.name) { index, item in
          HStack(spacing: 8) {
            Image(systemName: symbol(item.kind))
              .font(.caption)
              .foregroundStyle(.secondary)
            Text(item.displayName)
              .font(.subheadline.weight(.medium))
              .lineLimit(1)
            Spacer(minLength: 8)
            Text(SettingsUIStrings.runCount(item.runCount))
              .font(.subheadline)
              .foregroundStyle(.secondary)
              .monospacedDigit()
          }
          .padding(.vertical, 9)
          .accessibilityElement(children: .combine)
          if index < items.count - 1 { Divider() }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func symbol(_ kind: SettingsProfileSkillKind) -> String {
    switch kind {
    case .subagent: "cpu"
    case .mcp: "powerplug"
    case .tool: "wrench"
    case .skill: "sparkles"
    }
  }
}

struct ProfileBreakdownSection: View {
  let title: String
  var caption: String?
  let entries: [ProfileBreakdownItem]
  var compactValues = false
  let emptyText: String
  var limit = 6
  var footer: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline) {
        ProfileSectionHeading(title)
        Spacer()
        if let caption {
          Text(caption)
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
      }
      if entries.isEmpty {
        Text(emptyText)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      } else {
        ForEach(Array(entries.prefix(limit))) { entry in
          VStack(spacing: 6) {
            HStack(spacing: 12) {
              Text(entry.label)
                .font(.subheadline.weight(.medium))
                .lineLimit(1)
              Spacer(minLength: 8)
              Text(
                compactValues ? ProfilePresentation.compact(entry.count) : entry.count.formatted()
              )
              .font(.subheadline)
              .foregroundStyle(.secondary)
              .monospacedDigit()
              Text(ProfilePresentation.percent(entry.percent))
                .font(.caption)
                .foregroundStyle(.secondary)
                .monospacedDigit()
            }
            GeometryReader { proxy in
              Capsule()
                .fill(.primary.opacity(0.1))
                .overlay(alignment: .leading) {
                  Capsule()
                    .fill(.primary)
                    .frame(
                      width: proxy.size.width
                        * max(0.02, min(1, entry.percent / 100))
                    )
                }
            }
            .frame(height: 6)
          }
          .accessibilityElement(children: .combine)
        }
      }
      if let footer {
        Text(footer)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct ProfileAIActionsSection: View {
  let actions: [SettingsProfileAIAction]

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ProfileSectionHeading(SettingsUIStrings.aiGitActions)
      if actions.isEmpty {
        Text(SettingsUIStrings.noAIGitActions)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .padding(.vertical, 9)
      } else {
        ForEach(Array(actions.enumerated()), id: \.element.type) { index, action in
          HStack(spacing: 8) {
            Image(systemName: symbol(action.type))
              .font(.caption)
              .foregroundStyle(.secondary)
            Text(action.label)
              .font(.subheadline.weight(.medium))
              .lineLimit(1)
            Spacer(minLength: 8)
            if let provider = action.topProvider {
              Text(
                action.topModel.map { "\(provider) - \($0)" } ?? provider
              )
              .font(.caption2)
              .foregroundStyle(.secondary)
              .lineLimit(1)
            }
            Text(action.count.formatted())
              .font(.subheadline.weight(.medium))
              .monospacedDigit()
          }
          .padding(.vertical, 9)
          .accessibilityElement(children: .combine)
          if index < actions.count - 1 { Divider() }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func symbol(_ type: SettingsProfileAIActionKind) -> String {
    switch type {
    case .commit: "arrow.triangle.branch"
    case .pr: "arrow.triangle.pull"
    case .conflict: "arrow.merge"
    }
  }
}

struct ProfileSectionHeading: View {
  let title: String

  init(_ title: String) { self.title = title }

  var body: some View {
    Text(title)
      .font(.subheadline.weight(.semibold))
      .foregroundStyle(.primary)
      .padding(.bottom, 4)
  }
}

struct ProfileKeyValue: Identifiable {
  let id = UUID()
  let label: String
  let value: String
}

struct ProfileBreakdownItem: Identifiable {
  let id: String
  let label: String
  let count: Double
  let percent: Double

  init(_ entry: SettingsProfileBreakdown) {
    id = entry.key
    label = entry.label
    count = entry.count
    percent = entry.percent
  }

  init(_ entry: SettingsProfileTokenProvider) {
    id = entry.provider
    label = entry.label
    count = Double(entry.tokens)
    percent = entry.percent
  }
}
