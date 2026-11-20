import Foundation

/// Closed workflow-view vocabulary from the host's provider-owned interpreter.
/// Native code never reads scripts, tool names, or legacy result grammar.
struct RichWorkflowViewPlan: Codable, Equatable, Sendable {
  struct Phase: Codable, Equatable, Sendable { let title: String; let detail: String? }
  struct Agent: Codable, Equatable, Sendable { let label: String; let phaseTitle: String?; let model: String? }
  let description: String?
  let phases: [Phase]
  let plannedAgents: [Agent]
  let liveAgents: [Agent]
  let runId: String?
  let transcriptDir: String?

  init?(_ raw: RichJSON) {
    guard let data = try? JSONEncoder().encode(raw),
      let value = try? JSONDecoder().decode(Self.self, from: data),
      value.phases.count <= 256, value.plannedAgents.count <= 1024, value.liveAgents.count <= 1024 else { return nil }
    self = value
  }

  static var empty: Self { Self(.object(["phases": .array([]), "plannedAgents": .array([]), "liveAgents": .array([])]))! }
  var reference: WorkflowRunReference? {
    guard let runId, let transcriptDir else { return nil }
    return WorkflowRunReference(metadata: .object(["runId": .string(runId), "transcriptDir": .string(transcriptDir)]))
  }
}

struct RichWorkflowAgentRow: Identifiable, Equatable, Sendable {
  let agent: AdvancedWorkflowAgent
  let label: String
  let phaseTitle: String?
  let model: String?
  var id: String { agent.agentId }
  var isFinished: Bool { [.done, .failed, .cancelled].contains(agent.state) }
  func label(in phase: String) -> String {
    let prefix = phase + ":"
    guard !phase.isEmpty, label.lowercased().hasPrefix(prefix.lowercased()) else { return label }
    let suffix = String(label.dropFirst(prefix.count)).trimmingCharacters(in: .whitespacesAndNewlines)
    return suffix.isEmpty ? label : suffix
  }
}

struct RichWorkflowPhaseSection: Identifiable, Equatable, Sendable {
  let id: Int
  let title: String
  let detail: String?
  var agents: [RichWorkflowAgentRow]
  var completedCount: Int { agents.filter(\.isFinished).count }
}

/// Mirrors the PWA's positional plan fallback: a manifest's real phases, labels,
/// and model values win. The plan fills only information absent from the run.
struct RichWorkflowViewerProjection: Equatable, Sendable {
  let phases: [RichWorkflowPhaseSection]
  let unphased: [RichWorkflowAgentRow]

  init(run: AdvancedWorkflowRun?, plan: RichWorkflowViewPlan) {
    func fill(_ value: String?, with hint: String?) -> String? {
      guard let hint, !hint.isEmpty, value == nil || value?.isEmpty == true else { return value }
      return hint
    }
    func row(_ agent: AdvancedWorkflowAgent, planned: RichWorkflowViewPlan.Agent? = nil, phase: String? = nil) -> RichWorkflowAgentRow {
      .init(agent: agent, label: agent.label == agent.agentId ? (planned?.label ?? agent.label) : agent.label,
        phaseTitle: fill(agent.phaseTitle, with: planned?.phaseTitle) ?? phase, model: fill(agent.model, with: planned?.model))
    }
    let planned = plan.plannedAgents.isEmpty ? plan.liveAgents : plan.plannedAgents
    if let run, !run.phases.isEmpty || planned.isEmpty {
      phases = run.phases.enumerated().map { index, phase in
        .init(id: index, title: phase.title, detail: phase.detail,
          agents: phase.agents.map { row($0, phase: phase.title) })
      }
      unphased = run.unphasedAgents.map { row($0) }
      return
    }
    var phases = plan.phases.enumerated().map { RichWorkflowPhaseSection(id: $0.offset,
      title: $0.element.title, detail: $0.element.detail, agents: []) }
    var unphased: [RichWorkflowAgentRow] = []
    for (index, agent) in (run?.unphasedAgents ?? []).enumerated() {
      guard planned.indices.contains(index) else { unphased.append(row(agent)); continue }
      let value = row(agent, planned: planned[index])
      if let title = value.phaseTitle, let phaseIndex = phases.lastIndex(where: { $0.title == title }) {
        phases[phaseIndex].agents.append(value)
      } else { unphased.append(value) }
    }
    self.phases = phases; self.unphased = unphased
  }

  var allAgents: [RichWorkflowAgentRow] { phases.flatMap(\.agents) + unphased }
  var completedCount: Int { allAgents.filter(\.isFinished).count }
  func agent(_ id: String?) -> RichWorkflowAgentRow? { allAgents.first { $0.id == id } }
}
