import Foundation

/// Strict decoder for the 14 canonical runtime event types
/// (`src/shared/contracts/runtimeEvent.ts` `runtimeEventSchema`).
/// Unknown / malformed events return nil and must not partially mutate state.
enum RuntimeEventDecoder {
    // MARK: - Canonical enums

    static let canonicalItemTypes: Set<String> = [
        "user_message",
        "assistant_message",
        "reasoning",
        "plan",
        "goal",
        "command_execution",
        "file_change",
        "tool_call",
        "mcp_tool_call",
        "image_view",
        "dynamic_tool_call",
        "web_search",
        "question_answer",
        "error",
    ]

    static let canonicalRequestTypes: Set<String> = [
        "command_execution_approval",
        "file_read_approval",
        "file_change_approval",
        "apply_patch_approval",
        "tool_call_approval",
        "tool_user_input",
        "auth_refresh",
    ]

    static let contentStreams: Set<String> = [
        "assistant_text",
        "reasoning_text",
        "plan_text",
        "command_output",
        "file_change_output",
    ]

    /// Canonical turn.completed states — exact parity with `turnStateSchema`.
    static let turnStates: Set<String> = [
        "completed",
        "failed",
        "interrupted",
        "cancelled",
    ]

    static let requestOutcomes: Set<String> = [
        "accepted",
        "declined",
        "answered",
        "cancelled",
    ]

    // MARK: - Decode

    /// Strict parse. Returns nil for unknown types or missing/invalid required fields.
    static func decode(_ object: [String: JSONValue]) -> RuntimeEventReducer.RuntimeEvent? {
        guard let type = object["type"]?.stringValue else { return nil }

        switch type {
        case "session.started":
            guard let threadId = object["threadId"]?.stringValue else { return nil }
            if let turnId = object["turnId"], turnId.stringValue == nil { return nil }
            return .init(
                type: type,
                threadId: threadId,
                turnId: object["turnId"]?.stringValue,
                raw: object
            )

        case "session.exited":
            guard let threadId = object["threadId"]?.stringValue else { return nil }
            if let reason = object["reason"], reason.stringValue == nil { return nil }
            return .init(
                type: type,
                threadId: threadId,
                message: object["reason"]?.stringValue,
                raw: object
            )

        case "turn.started":
            guard let threadId = object["threadId"]?.stringValue,
                  let turnId = object["turnId"]?.stringValue
            else { return nil }
            return .init(
                type: type,
                threadId: threadId,
                turnId: turnId,
                raw: object
            )

        case "turn.completed":
            guard let threadId = object["threadId"]?.stringValue,
                  let turnId = object["turnId"]?.stringValue,
                  let state = object["state"]?.stringValue,
                  turnStates.contains(state)
            else { return nil }
            return .init(
                type: type,
                threadId: threadId,
                state: state,
                turnId: turnId,
                raw: object
            )

        case "item.started":
            guard let threadId = object["threadId"]?.stringValue,
                  let itemId = object["itemId"]?.stringValue,
                  let itemType = object["itemType"]?.stringValue,
                  canonicalItemTypes.contains(itemType)
            else { return nil }
            if let parent = object["parentItemId"], parent.stringValue == nil { return nil }
            return .init(
                type: type,
                threadId: threadId,
                itemId: itemId,
                itemType: itemType,
                payload: object["payload"],
                payloadSpecified: object.keys.contains("payload"),
                parentItemId: object["parentItemId"]?.stringValue,
                raw: object
            )

        case "item.updated":
            // MUST contain payload key (explicit null clears; absent is invalid).
            guard let threadId = object["threadId"]?.stringValue,
                  let itemId = object["itemId"]?.stringValue,
                  object.keys.contains("payload")
            else { return nil }
            return .init(
                type: type,
                threadId: threadId,
                itemId: itemId,
                payload: object["payload"], // may be JSON null → .null
                payloadSpecified: true,
                raw: object
            )

        case "item.completed":
            guard let threadId = object["threadId"]?.stringValue,
                  let itemId = object["itemId"]?.stringValue
            else { return nil }
            return .init(
                type: type,
                threadId: threadId,
                itemId: itemId,
                payload: object["payload"],
                payloadSpecified: object.keys.contains("payload"),
                raw: object
            )

        case "content.delta":
            guard let threadId = object["threadId"]?.stringValue,
                  let itemId = object["itemId"]?.stringValue,
                  let stream = object["stream"]?.stringValue,
                  contentStreams.contains(stream),
                  let delta = object["delta"]?.stringValue
            else { return nil }
            return .init(
                type: type,
                threadId: threadId,
                itemId: itemId,
                stream: stream,
                delta: delta,
                raw: object
            )

        case "context.updated":
            guard let threadId = object["threadId"]?.stringValue,
                  let usageValue = object["usage"],
                  case .object(let usageObj) = usageValue,
                  let usage = decodeContextUsage(usageObj)
            else { return nil }
            return .init(
                type: type,
                threadId: threadId,
                contextUsage: usage,
                raw: object
            )

        case "usage.spent":
            guard let threadId = object["threadId"]?.stringValue,
                  let usageValue = object["usage"],
                  case .object(let usageObj) = usageValue,
                  isValidUsageSpent(usageObj)
            else { return nil }
            return .init(
                type: type,
                threadId: threadId,
                raw: object
            )

        case "request.opened":
            guard let threadId = object["threadId"]?.stringValue,
                  let requestId = object["requestId"]?.stringValue,
                  let requestType = object["requestType"]?.stringValue,
                  canonicalRequestTypes.contains(requestType),
                  let payloadValue = object["payload"],
                  case .object(let payloadObj) = payloadValue,
                  isValidRequestPayload(payloadObj)
            else { return nil }
            return .init(
                type: type,
                threadId: threadId,
                payload: payloadValue,
                payloadSpecified: true,
                requestId: requestId,
                requestType: requestType,
                raw: object
            )

        case "request.resolved":
            guard let threadId = object["threadId"]?.stringValue,
                  let requestId = object["requestId"]?.stringValue,
                  let outcome = object["outcome"]?.stringValue,
                  requestOutcomes.contains(outcome)
            else { return nil }
            return .init(
                type: type,
                threadId: threadId,
                state: outcome,
                requestId: requestId,
                raw: object
            )

        case "warning", "error":
            guard let threadId = object["threadId"]?.stringValue,
                  let message = object["message"]?.stringValue
            else { return nil }
            return .init(
                type: type,
                threadId: threadId,
                message: message,
                raw: object
            )

        default:
            return nil
        }
    }

    static func decodeContextUsage(_ object: [String: JSONValue]) -> ThreadContextUsage? {
        var usage = ThreadContextUsage()
        if let used = object["usedTokens"] {
            guard let n = used.numberInt, n >= 0 else { return nil }
            usage.usedTokens = n
        }
        if let max = object["maxTokens"] {
            guard let n = max.numberInt, n > 0 else { return nil }
            usage.maxTokens = n
        }
        if let breakdown = object["breakdown"] {
            guard case .array(let entries) = breakdown else { return nil }
            for entry in entries {
                guard case .object(let obj) = entry,
                      let id = obj["id"]?.stringValue, !id.isEmpty,
                      let label = obj["label"]?.stringValue, !label.isEmpty,
                      let tokens = obj["tokens"]?.numberInt, tokens >= 0
                else { return nil }
            }
        }
        // Unknown extra fields remain forward-compatible.
        return usage
    }

    /// Canonical request.opened payload (`requestPayloadSchema`): summary required;
    /// options are optionId/label strings with optional description; multiSelect bool.
    static func isValidRequestPayload(_ object: [String: JSONValue]) -> Bool {
        guard object["summary"]?.stringValue != nil else { return false }
        if let options = object["options"] {
            guard case .array(let arr) = options else { return false }
            for value in arr {
                guard case .object(let opt) = value,
                      opt["optionId"]?.stringValue != nil,
                      opt["label"]?.stringValue != nil
                else { return false }
                if let description = opt["description"], description.stringValue == nil {
                    return false
                }
            }
        }
        if let multi = object["multiSelect"] {
            guard case .bool = multi else { return false }
        }
        return true
    }

    /// Persisted pending_request outer payload used by history hydration.
    /// Shape: { requestId, requestType?, payload: { summary, ... } }
    static func decodePendingRequestOuter(
        _ payload: JSONValue?
    ) -> (requestId: String, requestType: String?, payload: JSONValue)? {
        guard let payload, case .object(let outer) = payload,
              let requestId = outer["requestId"]?.stringValue, !requestId.isEmpty,
              let inner = outer["payload"],
              case .object(let innerObj) = inner,
              isValidRequestPayload(innerObj)
        else { return nil }
        let requestType = outer["requestType"]?.stringValue
        if let requestType, !canonicalRequestTypes.contains(requestType) {
            return nil
        }
        return (requestId, requestType, inner)
    }

    private static func isValidUsageSpent(_ object: [String: JSONValue]) -> Bool {
        guard let kind = object["counterKind"]?.stringValue,
              kind == "cumulative" || kind == "per-call"
        else { return false }
        guard let counter = object["counter"]?.numberInt, counter >= 0 else { return false }
        guard let scopeId = object["scopeId"]?.stringValue, !scopeId.isEmpty else { return false }
        guard let epoch = object["epoch"]?.numberInt, epoch >= 0 else { return false }
        guard let sampleId = object["sampleId"]?.stringValue, !sampleId.isEmpty else { return false }
        if let fresh = object["fresh"] {
            guard case .bool = fresh else { return false }
        }
        if let turnId = object["turnId"], turnId.stringValue == nil { return false }
        if let model = object["model"], model.stringValue == nil { return false }
        if let occurredAt = object["occurredAt"] {
            guard let n = occurredAt.numberInt, n >= 0 else { return false }
        }
        return true
    }
}
