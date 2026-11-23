import Foundation
import MetricKit
import SwiftUI
import UIKit

/// Scrubbed local-only crash diagnostic report following `docs/BACKLOG.md` policy:
/// keeps timestamps, app version/build, OS version, device model, categorical
/// exception/signal/termination fields, and binary image + offset frames; drops
/// messages, paths, host names, locale/region, and thread/session/user identifiers.
struct ScrubbedCrashReport: Codable, Identifiable, Equatable, Sendable {
  struct Frame: Codable, Equatable, Sendable {
    let binary: String
    let offset: UInt64
  }

  let id: String
  let timestampEpochMs: Int64
  let kind: String
  let appVersion: String
  let appBuild: String
  let osVersion: String
  let deviceModel: String
  let exceptionType: Int?
  let exceptionCode: Int?
  let signal: Int?
  let terminationReason: String?
  let frames: [Frame]
}

@MainActor
@Observable
final class CrashDiagnosticsStore: NSObject {
  static let shared = CrashDiagnosticsStore()
  static let maxReports = 20
  static let maxAgeDays = 30
  private static let enabledKey = "poracode.crash-diagnostics.enabled.v1"

  private(set) var reports: [ScrubbedCrashReport] = []
  var captureEnabled: Bool {
    didSet {
      UserDefaults.standard.set(captureEnabled, forKey: Self.enabledKey)
      if captureEnabled {
        registerSubscriberIfAllowed()
      } else {
        unregisterSubscriber()
        deleteAllReports()
      }
    }
  }

  private let directoryURL: URL

  override init() {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? FileManager.default.temporaryDirectory
    self.directoryURL = base.appendingPathComponent("Diagnostics", isDirectory: true)
    if UserDefaults.standard.object(forKey: Self.enabledKey) == nil {
      self.captureEnabled = true
    } else {
      self.captureEnabled = UserDefaults.standard.bool(forKey: Self.enabledKey)
    }
    super.init()
    ensurePrivateNoBackupDirectory()
    reloadReports()
    if captureEnabled {
      registerSubscriberIfAllowed()
    }
  }

  func reloadReports() {
    pruneExpiredAndExcess()
    let files = (try? FileManager.default.contentsOfDirectory(
      at: directoryURL,
      includingPropertiesForKeys: nil
    ))?.filter { $0.pathExtension == "json" } ?? []
    let decoder = JSONDecoder()
    reports = files.compactMap { url in
      guard let data = try? Data(contentsOf: url) else { return nil }
      return try? decoder.decode(ScrubbedCrashReport.self, from: data)
    }.sorted { $0.timestampEpochMs > $1.timestampEpochMs }
  }

  func deleteAllReports() {
    let files = (try? FileManager.default.contentsOfDirectory(at: directoryURL, includingPropertiesForKeys: nil)) ?? []
    for file in files { try? FileManager.default.removeItem(at: file) }
    reports = []
  }

  func exportJSON() -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    guard let data = try? encoder.encode(reports), let text = String(data: data, encoding: .utf8) else {
      return "[]"
    }
    return text
  }

  func record(_ report: ScrubbedCrashReport) {
    guard captureEnabled else { return }
    ensurePrivateNoBackupDirectory()
    let url = directoryURL.appendingPathComponent("\(report.timestampEpochMs)-\(report.id).json")
    if let data = try? JSONEncoder().encode(report) {
      try? data.write(to: url, options: [.atomic])
    }
    reloadReports()
  }

  private func ensurePrivateNoBackupDirectory() {
    try? FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)
    var mutableURL = directoryURL
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try? mutableURL.setResourceValues(values)
  }

  private func pruneExpiredAndExcess() {
    let cutoffMs = Int64((Date().timeIntervalSince1970 - Double(Self.maxAgeDays * 86_400)) * 1000)
    let files = (try? FileManager.default.contentsOfDirectory(at: directoryURL, includingPropertiesForKeys: nil))?
      .filter { $0.pathExtension == "json" } ?? []
    let decoder = JSONDecoder()
    var valid: [(url: URL, timestamp: Int64)] = []
    for file in files {
      if let data = try? Data(contentsOf: file),
        let parsed = try? decoder.decode(ScrubbedCrashReport.self, from: data),
        parsed.timestampEpochMs >= cutoffMs
      {
        valid.append((file, parsed.timestampEpochMs))
      } else {
        try? FileManager.default.removeItem(at: file)
      }
    }
    valid.sort { $0.timestamp > $1.timestamp }
    if valid.count > Self.maxReports {
      for excess in valid.dropFirst(Self.maxReports) {
        try? FileManager.default.removeItem(at: excess.url)
      }
    }
  }

  private func registerSubscriberIfAllowed() {
    #if !PORACODE_DISABLE_CRASH_DIAGNOSTICS
    MXMetricManager.shared.add(self)
    #endif
  }

  private func unregisterSubscriber() {
    #if !PORACODE_DISABLE_CRASH_DIAGNOSTICS
    MXMetricManager.shared.remove(self)
    #endif
  }

  nonisolated static func scrubTerminationReason(_ raw: String?) -> String? {
    guard let raw, !raw.isEmpty else { return nil }
    // Keep only short categorical prefix without file paths, URLs, or tokens.
    let firstLine = raw.components(separatedBy: .newlines).first ?? ""
    if firstLine.contains("/") || firstLine.contains("Bearer ") || firstLine.contains("token=") {
      return "redacted"
    }
    return String(firstLine.prefix(64))
  }
}

#if !PORACODE_DISABLE_CRASH_DIAGNOSTICS
extension CrashDiagnosticsStore: MXMetricManagerSubscriber {
  nonisolated func didReceive(_ payloads: [MXDiagnosticPayload]) {
    let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
    let appBuild = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
    let osVersion = ProcessInfo.processInfo.operatingSystemVersionString
    var uts = utsname()
    uname(&uts)
    let model = withUnsafePointer(to: &uts.machine) {
      $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(validatingCString: $0) ?? "iOS" }
    }
    var captured: [ScrubbedCrashReport] = []
    for payload in payloads {
      let ts = Int64(payload.timeStampEnd.timeIntervalSince1970 * 1000)
      for crash in payload.crashDiagnostics ?? [] {
        captured.append(ScrubbedCrashReport(
          id: UUID().uuidString.lowercased(),
          timestampEpochMs: ts,
          kind: "crash",
          appVersion: appVersion,
          appBuild: appBuild,
          osVersion: osVersion,
          deviceModel: model,
          exceptionType: crash.exceptionType?.intValue,
          exceptionCode: crash.exceptionCode?.intValue,
          signal: crash.signal?.intValue,
          terminationReason: CrashDiagnosticsStore.scrubTerminationReason(crash.terminationReason),
          frames: []
        ))
      }
      for _ in payload.hangDiagnostics ?? [] {
        captured.append(ScrubbedCrashReport(
          id: UUID().uuidString.lowercased(),
          timestampEpochMs: ts,
          kind: "hang",
          appVersion: appVersion,
          appBuild: appBuild,
          osVersion: osVersion,
          deviceModel: model,
          exceptionType: nil,
          exceptionCode: nil,
          signal: nil,
          terminationReason: "hang",
          frames: []
        ))
      }
      for _ in payload.cpuExceptionDiagnostics ?? [] {
        captured.append(ScrubbedCrashReport(
          id: UUID().uuidString.lowercased(),
          timestampEpochMs: ts,
          kind: "cpu_exception",
          appVersion: appVersion,
          appBuild: appBuild,
          osVersion: osVersion,
          deviceModel: model,
          exceptionType: nil,
          exceptionCode: nil,
          signal: nil,
          terminationReason: "cpu_exception",
          frames: []
        ))
      }
      for _ in payload.diskWriteExceptionDiagnostics ?? [] {
        captured.append(ScrubbedCrashReport(
          id: UUID().uuidString.lowercased(),
          timestampEpochMs: ts,
          kind: "disk_write_exception",
          appVersion: appVersion,
          appBuild: appBuild,
          osVersion: osVersion,
          deviceModel: model,
          exceptionType: nil,
          exceptionCode: nil,
          signal: nil,
          terminationReason: "disk_write_exception",
          frames: []
        ))
      }
    }
    Task { @MainActor in
      for item in captured {
        CrashDiagnosticsStore.shared.record(item)
      }
    }
  }
}
#endif

struct CrashDiagnosticsSettingsView: View {
  @State private var store = CrashDiagnosticsStore.shared

  var body: some View {
    List {
      Section {
        Toggle("Capture local crash diagnostics", isOn: $store.captureEnabled)
      } footer: {
        Text("Reports stay on this device (max 20 reports, 30 days) and are never sent automatically. Turning this off deletes stored reports.")
      }
      Section("Stored reports (\(store.reports.count))") {
        if store.reports.isEmpty {
          Text("No crash diagnostics recorded.").font(.footnote).foregroundStyle(.secondary)
        } else {
          ForEach(store.reports) { report in
            VStack(alignment: .leading, spacing: 3) {
              Text("\(report.kind.uppercased()) · v\(report.appVersion) (\(report.appBuild))")
                .font(.footnote.weight(.medium))
              Text(Date(timeIntervalSince1970: Double(report.timestampEpochMs) / 1000).formatted())
                .font(.caption2)
                .foregroundStyle(.secondary)
              if let reason = report.terminationReason {
                Text(reason).font(.caption2).foregroundStyle(.secondary)
              }
            }
          }
        }
      }
      if !store.reports.isEmpty {
        Section {
          ShareLink(item: store.exportJSON(), subject: Text("Poracode iOS Diagnostics")) {
            Label("Share diagnostics JSON", systemImage: "square.and.arrow.up")
          }
          Button("Delete all reports", role: .destructive) {
            store.deleteAllReports()
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle("Diagnostics")
    .navigationBarTitleDisplayMode(.inline)
    .onAppear { store.reloadReports() }
  }
}
