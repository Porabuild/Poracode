import SwiftUI

struct ProfileStatGrid: View {
  let information: SettingsProfileInformation
  let window: SettingsProfileWindow

  var body: some View {
    let tokens = information.tokens
    let totals = information.core.totals
    let entries = [
      ProfileStatEntry(
        value: tokens.available ? ProfilePresentation.compact(tokens.lifetimeTokens) : "-",
        label: window == .all ? SettingsUIStrings.lifetimeTokens : SettingsUIStrings.totalTokens
      ),
      ProfileStatEntry(
        value: tokens.available ? ProfilePresentation.compact(tokens.peakDayTokens) : "-",
        label: SettingsUIStrings.peakDay,
        detail: tokens.peakDay.flatMap(ProfilePresentation.dayLabel)
      ),
      ProfileStatEntry(
        value: ProfilePresentation.duration(totals.longestTaskMs),
        label: SettingsUIStrings.longestTask
      ),
      ProfileStatEntry(
        value: ProfilePresentation.dayCount(totals.currentStreakDays),
        label: SettingsUIStrings.currentStreak
      ),
      ProfileStatEntry(
        value: ProfilePresentation.dayCount(totals.longestStreakDays),
        label: SettingsUIStrings.longestStreak
      ),
    ]

    LazyVGrid(
      columns: Array(repeating: GridItem(.flexible(), spacing: 1), count: 2),
      spacing: 1
    ) {
      ForEach(entries) { entry in
        VStack(spacing: 4) {
          Text(entry.value)
            .font(.title3.weight(.semibold))
            .monospacedDigit()
          Text(entry.label)
            .font(.caption)
            .foregroundStyle(.secondary)
          Text(entry.detail ?? " ")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 96)
        .background(Color(uiColor: .secondarySystemBackground))
        .accessibilityElement(children: .combine)
      }
      Color(uiColor: .secondarySystemBackground)
        .frame(minHeight: 96)
        .accessibilityHidden(true)
    }
    .background(Color(uiColor: .separator))
    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 4, style: .continuous)
        .stroke(Color(uiColor: .separator), lineWidth: 1)
    }
  }
}

private struct ProfileStatEntry: Identifiable {
  let id = UUID()
  let value: String
  let label: String
  var detail: String?
}

struct ProfileActivityHeatmap: View {
  let heatmap: SettingsProfileHeatmap

  var body: some View {
    GeometryReader { proxy in
      let grid = ProfilePresentation.heatmapGrid(heatmap.cells)
      let gap: CGFloat = 3
      let cell = max(
        2,
        (proxy.size.width - CGFloat(max(0, grid.columns.count - 1)) * gap)
          / CGFloat(max(1, grid.columns.count)))

      VStack(alignment: .leading, spacing: 5) {
        if heatmap.windowDays <= 30 {
          let shortCell = min(
            12,
            max(
              2,
              (proxy.size.width - CGFloat(max(0, heatmap.cells.count - 1)) * gap)
                / CGFloat(max(1, heatmap.cells.count))
            )
          )
          HStack(spacing: gap) {
            Spacer(minLength: 0)
            ForEach(heatmap.cells, id: \.day) { item in
              RoundedRectangle(cornerRadius: min(2, shortCell / 3), style: .continuous)
                .fill(ProfilePresentation.heatmapColor(item.intensity))
                .frame(width: shortCell, height: shortCell)
            }
          }
        } else {
          HStack(spacing: gap) {
            ForEach(Array(grid.monthLabels.enumerated()), id: \.offset) { _, month in
              Text(month ?? " ")
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: true, vertical: false)
                .frame(width: cell, alignment: .leading)
            }
          }
          HStack(alignment: .top, spacing: gap) {
            ForEach(Array(grid.columns.enumerated()), id: \.offset) { _, column in
              VStack(spacing: gap) {
                ForEach(Array(column.enumerated()), id: \.offset) { _, item in
                  RoundedRectangle(cornerRadius: min(2, cell / 3), style: .continuous)
                    .fill(ProfilePresentation.heatmapColor(item?.intensity))
                    .frame(width: cell, height: cell)
                    .opacity(item == nil ? 0 : 1)
                }
              }
            }
          }
        }
        HStack(spacing: 5) {
          Spacer()
          Text(SettingsUIStrings.less)
          ForEach(0..<5) { intensity in
            RoundedRectangle(cornerRadius: 2, style: .continuous)
              .fill(ProfilePresentation.heatmapColor(Int64(intensity)))
              .frame(width: 10, height: 10)
          }
          Text(SettingsUIStrings.more)
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
      }
    }
    .frame(height: heatmap.windowDays <= 30 ? 42 : 106)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(SettingsUIStrings.activityTitle)
  }
}
