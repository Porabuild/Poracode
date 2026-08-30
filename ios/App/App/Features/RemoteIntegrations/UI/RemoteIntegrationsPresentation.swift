import Foundation

enum RemoteIntegrationsPresentation {
  static func updateStatus(_ status: RemoteIntegrationsHostUpdateStatus?) -> String {
    switch status {
    case nil: RemoteIntegrationsStrings.updateIdle
    case .checking: RemoteIntegrationsStrings.checking
    case .available(let version): RemoteIntegrationsStrings.updateAvailable(version)
    case .unavailable: RemoteIntegrationsStrings.upToDate
    case .downloading: RemoteIntegrationsStrings.downloading
    case .downloaded(let version): RemoteIntegrationsStrings.downloaded(version)
    case .failed: RemoteIntegrationsStrings.updateFailed
    }
  }

  static func scheduleStatus(_ status: RemoteIntegrationsScheduleStatus) -> String {
    switch status {
    case .never: RemoteIntegrationsStrings.never
    case .running: RemoteIntegrationsStrings.running
    case .succeeded: RemoteIntegrationsStrings.succeeded
    case .failed: RemoteIntegrationsStrings.failed
    }
  }

  static func scheduleRunStatus(_ status: RemoteIntegrationsScheduleRunStatus) -> String {
    switch status {
    case .running: RemoteIntegrationsStrings.running
    case .succeeded: RemoteIntegrationsStrings.succeeded
    case .failed: RemoteIntegrationsStrings.failed
    case .interrupted: RemoteIntegrationsStrings.interrupted
    }
  }

  static func recurrence(_ recurrence: RemoteIntegrationsScheduleRecurrence) -> String {
    switch recurrence {
    case .hourly(let minute): return RemoteIntegrationsStrings.minuteValue(minute)
    case .weekly(let days, let time):
      let symbols = Calendar.current.shortWeekdaySymbols
      let labels = days.compactMap { symbols.indices.contains($0) ? symbols[$0] : nil }
      return labels.isEmpty ? time : "\(labels.joined(separator: ", ")) · \(time)"
    case .once(let runAt):
      return formattedDate(runAt) ?? RemoteIntegrationsStrings.once
    }
  }

  static func formattedDate(_ value: String?) -> String? {
    guard let value else { return nil }
    let date =
      isoFormatter(fractionalSeconds: true).date(from: value)
      ?? isoFormatter(fractionalSeconds: false).date(from: value)
    return date?.formatted(date: .abbreviated, time: .shortened)
  }

  static func progress(_ status: RemoteIntegrationsHostUpdateStatus?) -> Double? {
    guard case .downloading(let download) = status else { return nil }
    return min(max(download.percent / 100, 0), 1)
  }

  private static func isoFormatter(fractionalSeconds: Bool) -> ISO8601DateFormatter {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions =
      fractionalSeconds
      ? [.withInternetDateTime, .withFractionalSeconds]
      : [.withInternetDateTime]
    return formatter
  }
}
