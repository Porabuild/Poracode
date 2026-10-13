import SwiftUI

struct RemoteIntegrationsAutomationControls: View {
  @Binding var draft: RemoteIntegrationsAutomationDraft
  let supportsCompletionCheck: Bool
  let targets: [RemoteThread]

  var body: some View {
    Section(RemoteAutomationsStrings.execution) {
      Picker(RemoteAutomationsStrings.execution, selection: $draft.mode) {
        Text(RemoteAutomationsStrings.newConversation).tag("new-thread")
        Text(RemoteAutomationsStrings.existingConversation).tag("heartbeat")
      }
      if draft.mode == "heartbeat" {
        Picker(RemoteAutomationsStrings.conversation, selection: $draft.targetThreadId) {
          Text(RemoteAutomationsStrings.chooseConversation).tag("")
          ForEach(targets) { thread in Text(thread.title).tag(thread.id) }
          if !draft.targetThreadId.isEmpty, !targets.contains(where: { $0.id == draft.targetThreadId }) {
            Text(RemoteAutomationsStrings.unavailableConversation).tag(draft.targetThreadId)
          }
        }
        Toggle(RemoteAutomationsStrings.stopWhenDone, isOn: $draft.evaluateCompletion)
          .disabled(!supportsCompletionCheck && !draft.evaluateCompletion)
        if !supportsCompletionCheck {
          Text(RemoteAutomationsStrings.completionUnavailable).foregroundStyle(.secondary)
        }
        if draft.evaluateCompletion {
          TextField(RemoteAutomationsStrings.stopCondition, text: $draft.stopWhen, axis: .vertical)
          LabeledContent(RemoteAutomationsStrings.confidence) {
            Text(draft.confidenceThreshold, format: .percent.precision(.fractionLength(0)))
          }
          Slider(value: $draft.confidenceThreshold, in: 0...1, step: 0.05)
        }
      }
      DisclosureGroup(RemoteAutomationsStrings.limitsAndRetries) {
        Stepper(value: $draft.maxRuntimeSeconds, in: 60...86400, step: 60) {
          LabeledContent(RemoteAutomationsStrings.runtimeSeconds, value: String(draft.maxRuntimeSeconds))
        }
        Stepper(value: $draft.maxIterations, in: 0...100) {
          LabeledContent(RemoteAutomationsStrings.runLimit, value: draft.maxIterations == 0 ? RemoteAutomationsStrings.unlimited : String(draft.maxIterations))
        }
        Toggle(RemoteAutomationsStrings.stopOnError, isOn: $draft.stopOnError)
        Picker(RemoteAutomationsStrings.missedRuns, selection: $draft.misfirePolicy) {
          Text(RemoteAutomationsStrings.coalesce).tag("coalesce")
          Text(RemoteAutomationsStrings.skip).tag("skip")
          Text(RemoteAutomationsStrings.runLatest).tag("run-latest")
        }
        Picker(RemoteAutomationsStrings.retries, selection: $draft.retryKind) {
          Text(RemoteAutomationsStrings.noRetries).tag("none")
          Text(RemoteAutomationsStrings.fixedDelay).tag("fixed")
          Text(RemoteAutomationsStrings.exponentialDelay).tag("exponential")
        }
        if draft.retryKind != "none" {
          Stepper(value: $draft.maxAttempts, in: 2...6) {
            LabeledContent(RemoteAutomationsStrings.attempts, value: String(draft.maxAttempts))
          }
          Stepper(value: $draft.retryDelay, in: 1...3600) {
            LabeledContent(RemoteAutomationsStrings.retrySeconds, value: String(draft.retryDelay))
          }
          if draft.retryKind == "exponential" {
            Stepper(value: $draft.maxRetryDelay, in: 1...3600) {
              LabeledContent(RemoteAutomationsStrings.maximumDelay, value: String(draft.maxRetryDelay))
            }
          }
        }
      }
    }
  }
}
