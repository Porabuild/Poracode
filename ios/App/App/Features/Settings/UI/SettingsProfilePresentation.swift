import SwiftUI

enum ProfilePresentation {
  struct HeatmapGrid {
    let columns: [[SettingsProfileHeatmapCell?]]
    let monthLabels: [String?]
  }

  static func initials(_ name: String) -> String {
    let parts = name.split(whereSeparator: \.isWhitespace)
    guard let first = parts.first else { return "?" }
    if parts.count == 1 { return String(first.prefix(2)).uppercased() }
    return "\(first.first.map(String.init) ?? "")\(parts.last?.first.map(String.init) ?? "")"
      .uppercased()
  }

  static func deviceSymbol(_ platform: String) -> String {
    switch platform {
    case "darwin": "laptopcomputer"
    case "win32", "linux": "desktopcomputer"
    default: "iphone"
    }
  }

  static func compact(_ value: Int64) -> String {
    compact(Double(value))
  }

  static func compact(_ value: Double) -> String {
    guard value > 0 else { return "0" }
    let units: [(limit: Double, suffix: String)] = [
      (1_000_000_000_000, "T"),
      (1_000_000_000, "B"),
      (1_000_000, "M"),
      (1_000, "K"),
    ]
    for unit in units where value >= unit.limit {
      let scaled = value / unit.limit
      let formatter = NumberFormatter()
      formatter.locale = .current
      formatter.numberStyle = .decimal
      formatter.usesGroupingSeparator = false
      formatter.minimumFractionDigits = 0
      formatter.maximumFractionDigits = scaled >= 100 ? 0 : 1
      return
        "\(formatter.string(from: NSNumber(value: scaled)) ?? String(Int(scaled)))\(unit.suffix)"
    }
    return Int64(value.rounded()).formatted()
  }

  static func duration(_ milliseconds: Int64) -> String {
    guard milliseconds > 0 else { return "-" }
    let seconds = milliseconds / 1_000
    if seconds >= 3_600 { return "\(seconds / 3_600)h \((seconds % 3_600) / 60)m" }
    if seconds >= 60 { return "\(seconds / 60)m \(seconds % 60)s" }
    return "\(seconds)s"
  }

  static func dayCount(_ days: Int64) -> String {
    DateComponentsFormatter.localizedString(
      from: DateComponents(day: Int(days)), unitsStyle: .full)
      ?? days.formatted()
  }

  static func dayLabel(_ value: String) -> String? {
    guard let date = date(value) else { return nil }
    let formatter = DateFormatter()
    formatter.locale = .current
    formatter.timeZone = .gmt
    formatter.setLocalizedDateFormatFromTemplate("MMMd")
    return formatter.string(from: date)
  }

  static func heatmapGrid(_ cells: [SettingsProfileHeatmapCell]) -> HeatmapGrid {
    var padded: [SettingsProfileHeatmapCell?] = []
    if let first = cells.first, let date = date(first.day) {
      let weekday = Calendar(identifier: .gregorian).component(.weekday, from: date) - 1
      padded.append(contentsOf: Array(repeating: nil, count: weekday))
    }
    padded.append(contentsOf: cells.map(Optional.some))
    while padded.count % 7 != 0 { padded.append(nil) }

    var columns: [[SettingsProfileHeatmapCell?]] = []
    for start in stride(from: 0, to: padded.count, by: 7) {
      columns.append(Array(padded[start..<min(start + 7, padded.count)]))
    }

    let monthSymbols = DateFormatter().shortMonthSymbols ?? []
    var previousMonth: Int?
    let labels = columns.map { column -> String? in
      guard let first = column.compactMap({ $0 }).first,
        let date = date(first.day)
      else { return nil }
      let month = Calendar(identifier: .gregorian).component(.month, from: date)
      guard previousMonth != month else { return nil }
      previousMonth = month
      return monthSymbols.indices.contains(month - 1) ? monthSymbols[month - 1] : nil
    }
    return HeatmapGrid(columns: columns, monthLabels: labels)
  }

  static func heatmapColor(_ intensity: Int64?) -> Color {
    switch intensity ?? 0 {
    case 1: .primary.opacity(0.32)
    case 2: .primary.opacity(0.55)
    case 3: .primary.opacity(0.78)
    case 4...: .primary
    default: .primary.opacity(0.08)
    }
  }

  static func percent(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.locale = .current
    formatter.numberStyle = .percent
    formatter.multiplier = 1
    formatter.maximumFractionDigits = value.rounded() == value ? 0 : 1
    return formatter.string(from: NSNumber(value: value)) ?? "\(value)%"
  }

  static func breakdownSummary(_ entry: SettingsProfileBreakdown?) -> String {
    guard let entry else { return "-" }
    return "\(entry.label) - \(percent(entry.percent))"
  }

  static func providerLabel(_ key: String) -> String {
    key.split(whereSeparator: { "-_:".contains($0) })
      .map { part in part.prefix(1).uppercased() + part.dropFirst() }
      .joined(separator: " ")
  }

  static func avatarColor(_ value: String) -> Color {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.hasPrefix("#") {
      let hex = String(trimmed.dropFirst())
      if hex.count == 6, let rgb = UInt64(hex, radix: 16) {
        return Color(
          red: Double((rgb >> 16) & 0xff) / 255,
          green: Double((rgb >> 8) & 0xff) / 255,
          blue: Double(rgb & 0xff) / 255
        )
      }
    }
    if trimmed.hasPrefix("oklch("), trimmed.hasSuffix(")") {
      let values = trimmed.dropFirst(6).dropLast().split(whereSeparator: \.isWhitespace)
        .compactMap { Double($0) }
      if values.count >= 3 {
        let radians = values[2] * .pi / 180
        let a = values[1] * cos(radians)
        let b = values[1] * sin(radians)
        let l = pow(values[0] + 0.396_337_777_4 * a + 0.215_803_757_3 * b, 3)
        let m = pow(values[0] - 0.105_561_345_8 * a - 0.063_854_172_8 * b, 3)
        let s = pow(values[0] - 0.089_484_177_5 * a - 1.291_485_548 * b, 3)
        return Color(
          red: gamma(4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s),
          green: gamma(-1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s),
          blue: gamma(-0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s)
        )
      }
    }
    return .poracodeIndigo
  }

  private static func gamma(_ component: Double) -> Double {
    let value =
      component <= 0.003_130_8
      ? 12.92 * component
      : 1.055 * pow(component, 1 / 2.4) - 0.055
    return min(1, max(0, value))
  }

  private static func date(_ value: String) -> Date? {
    let values = value.split(separator: "-").compactMap { Int($0) }
    guard values.count == 3 else { return nil }
    var components = DateComponents()
    components.calendar = Calendar(identifier: .gregorian)
    components.timeZone = .gmt
    components.year = values[0]
    components.month = values[1]
    components.day = values[2]
    return components.date
  }
}
