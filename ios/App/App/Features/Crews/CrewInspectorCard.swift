import SwiftUI

struct CrewRunPresentation: Identifiable, Equatable {
  let id: String
  let role: String?
  let title: String
  let isRunning: Bool

  static func project(_ items: [RichRuntimeItem]) -> [Self] {
    items.compactMap { item in
      guard item.type == "tool_call", item.parentItemID == nil,
        let payload = item.payload?.objectValue, payload["isCrossagent"]?.boolValue == true else { return nil }
      let args = payload["args"]?.objectValue
      let role = payload["subAgentType"]?.stringValue
        ?? ["subagent_type", "agent_type", "agentType"].compactMap { args?[$0]?.stringValue }.first
      let title = args?["description"]?.stringValue ?? payload["title"]?.stringValue ?? payload["name"]?.stringValue ?? ""
      return .init(id: item.id, role: role?.trimmingCharacters(in: CrewWire.whitespace).lowercased(),
        title: title, isRunning: item.state != .completed || payload["status"]?.stringValue == "running")
    }
  }
}

/// Remote PWA's Crew dock, using the same runtime role labels. Cancellation of
/// helper runs stays host-owned, as on the remote PWA. The roster itself is a
/// normal collapsible, reorderable inspector section.
struct CrewInspectorCard: View {
  let binding: ThreadCrewBinding
  let lead: CrewMemberSelection
  let statuses: [AgentStatusRecord]
  let saved: SavedCrew?
  let items: [RichRuntimeItem]
  var openCrew: (() -> Void)?

  private var runs: [CrewRunPresentation] { CrewRunPresentation.project(items) }
  private var catalog: CrewModelCatalog { CrewModelCatalog(statuses: statuses, document: nil) }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Label(binding.policy == .crewOnly ? CrewStrings.only : CrewStrings.first,
          systemImage: binding.policy == .crewOnly ? "lock" : "lock.open")
          .font(.caption).foregroundStyle(.secondary)
        Spacer(minLength: 4)
        if let openCrew {
          Button(action: openCrew) { Label(CrewStrings.edit, systemImage: "pencil") }
            .labelStyle(.iconOnly).poracodeGlassButtonStyle()
            .accessibilityIdentifier("native-e2e.crew.inspector-edit")
        }
      }
      member(lead, role: CrewStrings.lead, noEdits: false, parallel: 1,
        changed: saved.map { !Self.same(lead, $0.lead) } ?? false)
      ForEach(binding.roles) { role in
        member(role.selection, role: role.label, noEdits: role.noEdits, parallel: role.parallelCount,
          changed: saved.map { Self.changed(role, in: $0) } ?? false)
        ForEach(runs.filter { $0.role == role.label.trimmingCharacters(in: CrewWire.whitespace).lowercased() }) { run in
          runRow(run)
        }
      }
      let roleKeys = Set(binding.roles.map { $0.label.trimmingCharacters(in: CrewWire.whitespace).lowercased() })
      ForEach(runs.filter { $0.role.map(roleKeys.contains) != true }) { run in runRow(run) }
    }
    .padding(12)
  }

  private func member(_ selection: CrewMemberSelection, role: String, noEdits: Bool, parallel: Int, changed: Bool) -> some View {
    HStack(spacing: 8) {
      HomeProviderIcon(kind: selection.agentKind).frame(width: 20, height: 20)
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 5) {
          Text(catalog.label(for: selection)).font(.caption.weight(.semibold)).lineLimit(1)
          if selection.fast == true { Image(systemName: "bolt.fill").font(.caption2).accessibilityLabel(HomeStrings.fast) }
          if noEdits { Image(systemName: "pencil.slash").font(.caption2).accessibilityLabel(CrewStrings.noEdits) }
          if changed { Circle().fill(.tint).frame(width: 5, height: 5).accessibilityLabel(CrewStrings.changed) }
        }
        Text(([statuses.first { $0.kind == selection.agentKind }?.label ?? selection.agentKind]
          + [selection.effort, selection.contextSize].compactMap { $0 }.filter { !$0.isEmpty }).joined(separator: " · "))
          .font(.caption2).foregroundStyle(.secondary).lineLimit(2)
      }
      Spacer(minLength: 2)
      Text(role + (parallel > 1 ? " ×\(parallel)" : ""))
        .font(.caption2.weight(.medium)).foregroundStyle(.secondary).lineLimit(2)
    }
  }

  private func runRow(_ run: CrewRunPresentation) -> some View {
    HStack(spacing: 8) {
      if run.isRunning { ProgressView().controlSize(.mini) }
      else { Image(systemName: "checkmark.circle").foregroundStyle(.secondary) }
      Text(run.title).font(.caption).lineLimit(3)
    }
    .padding(.leading, 28)
  }

  static func same(_ left: CrewMemberSelection, _ right: CrewMemberSelection) -> Bool {
    left.agentKind == right.agentKind && left.model == right.model && (left.fast == true) == (right.fast == true)
      && (left.effort ?? "") == (right.effort ?? "") && (left.contextSize ?? "") == (right.contextSize ?? "")
  }

  static func changed(_ role: CrewRole, in saved: SavedCrew) -> Bool {
    guard let old = saved.roles.first(where: { $0.id == role.id }) else { return true }
    return role.label != old.label || role.brief != old.brief || role.noEdits != old.noEdits
      || role.parallelCount != old.parallelCount || !same(role.selection, old.selection)
      || (role.fallbacks ?? []).count != (old.fallbacks ?? []).count
      || !zip(role.fallbacks ?? [], old.fallbacks ?? []).allSatisfy(same)
  }
}
