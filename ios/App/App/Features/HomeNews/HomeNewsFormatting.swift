import Foundation

/// Formats the PWA's translated messages through native String Catalog plural
/// rules. The generator converts the existing ICU catalog; no second translation
/// source or client-specific plural-rule table is maintained.
enum HomeNewsFormatting {
  static func text(_ key: String, locale: Locale, arguments: [CVarArg]) -> String {
    var code = locale.identifier.replacingOccurrences(of: "_", with: "-")
    if code.lowercased().hasPrefix("zh-cn") { code = "zh-Hans" }
    let language = code.split(separator: "-").first.map(String.init) ?? code
    let path = Bundle.main.path(forResource: code, ofType: "lproj") ?? Bundle.main.path(forResource: language, ofType: "lproj")
    let bundle = path.flatMap(Bundle.init(path:)) ?? Bundle.main
    let format = bundle.localizedString(forKey: key, value: key, table: "HomeNews")
    return String(format: format, locale: locale, arguments: arguments)
  }

  static func insight(_ fact: HomeNewsInsightFact, locale: Locale) -> String {
    switch fact {
    case .streak(let current, let longest):
      return text(current >= longest ? "news.streak.best" : "news.streak.previous", locale: locale, arguments: [current, longest])
    case .weekPrompts(let prompts, _, let busiest):
      if let busiest, let date = HomeNewsFeed.instant(busiest) {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEEE"
        return text("news.week.busiest", locale: locale, arguments: [prompts, formatter.string(from: Date(timeIntervalSince1970: date / 1_000))])
      }
      return text("news.week", locale: locale, arguments: [prompts])
    case .topModel(let label, let percent):
      return text("news.model", locale: locale, arguments: [label, percent.formatted(.number.precision(.fractionLength(0)).locale(locale))])
    case .activeHour(let hour):
      let formatter = DateFormatter()
      formatter.locale = locale
      formatter.timeZone = TimeZone(secondsFromGMT: 0)
      formatter.dateFormat = DateFormatter.dateFormat(fromTemplate: "j", options: 0, locale: locale)
      let date = Calendar(identifier: .gregorian).date(from: DateComponents(timeZone: TimeZone(secondsFromGMT: 0), year: 2000, month: 1, day: 1, hour: Int(hour))) ?? .distantPast
      return text("news.hour", locale: locale, arguments: [formatter.string(from: date)])
    case .longestTask(let minutes):
      let formatter = MeasurementFormatter()
      formatter.locale = locale
      formatter.unitStyle = .short
      formatter.unitOptions = .providedUnit
      formatter.numberFormatter.maximumFractionDigits = minutes < 120 ? 0 : 1
      let duration = minutes < 120 ? Measurement(value: Double(minutes), unit: UnitDuration.minutes) : Measurement(value: Double(minutes) / 60, unit: UnitDuration.hours)
      return text("news.task", locale: locale, arguments: [formatter.string(from: duration)])
    }
  }

  static func headlineCaption(_ highlight: HomeNewsHighlight, locale: Locale) -> String {
    let key: String
    switch highlight.change.kind { case .added: key = "news.new"; case .improved: key = "news.improved"; case .fixed: key = "news.fixed" }
    return text(key, locale: locale, arguments: [highlight.version])
  }

  static func template(_ template: HomeNewsFeedTemplate, locale: Locale) -> String {
    switch template.name {
    case .stars:
      return text("news.stars", locale: locale, arguments: [template.count.formatted(.number.locale(locale))])
    case .issues:
      return text("news.issues", locale: locale, arguments: [template.count])
    }
  }
}
