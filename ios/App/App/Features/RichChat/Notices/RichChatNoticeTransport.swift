import Foundation

/// B1 notice route edge on the JSON client.
///
/// Both routes are declared-only: the host refuses a request without
/// `notices=v1`, so this edge fails closed (`unavailable`) unless the client's
/// effective declaration is set. The technical diagnostics stay here; the
/// caller never receives a silently downgraded read or acknowledgement.
extension RemoteAPIClient {
    /// `GET /api/threads/{threadId}/runtime/gap?notices=v1` — the current
    /// unacknowledged episode descriptor plus the durable notice, if any.
    func runtimeHistoryGap(threadId: String) async throws -> RemoteHistoryGapRead {
        guard effectiveNoticesDeclaration else { throw RichChatGatewayError.unavailable }
        let validated = try GeneratedRemoteV3Contract.runtimeGapPath(threadId: threadId)
        let query = try GeneratedRemoteV3Contract.runtimeGapQuery()
        let path = "/api/threads/\(Self.encodePathSegment(validated))/runtime/gap"
        let data = try await requestData(path: path, queryItems: query)
        let canonical = try GeneratedRemoteV3Contract.runtimeGapResponse(data)
        return try JSONDecoding.decode(RemoteHistoryGapReadWire.self, from: canonical).project()
    }

    /// `POST /api/threads/{threadId}/runtime/gap/acknowledge?notices=v1` with
    /// the caller's idempotency command id and the opaque episode token.
    func acknowledgeRuntimeHistoryGap(
        threadId: String,
        episodeToken: String,
        commandID: String
    ) async throws -> RemoteHistoryGapAcknowledgeOutcome {
        guard effectiveNoticesDeclaration else { throw RichChatGatewayError.unavailable }
        guard !episodeToken.isEmpty, !commandID.isEmpty else {
            throw RichChatGatewayError.invalidRequest
        }
        let validated = try GeneratedRemoteV3Contract.runtimeGapAcknowledgePath(
            threadId: threadId
        )
        let query = try GeneratedRemoteV3Contract.runtimeGapAcknowledgeQuery()
        let body = try GeneratedRemoteV3Contract.runtimeGapAcknowledgeRequest(
            threadId: validated, episodeToken: episodeToken
        )
        let path = "/api/threads/\(Self.encodePathSegment(validated))/runtime/gap/acknowledge"
        let data: Data
        do {
            data = try await requestData(
                path: path,
                method: "POST",
                queryItems: query,
                jsonBody: body,
                extraHeaders: [ProtocolConstants.commandIdHeader: commandID]
            )
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as RemoteClientError
            where RemoteMutationClassification.classify(
                statusCode: error.status, code: error.code
            ) == .requestMayHaveCommitted
        {
            // An uncertain acknowledgement is never replayed blindly: the
            // caller retains the exact command id/token and retries once, and
            // the host's receipt reconciles the outcome.
            throw RichChatTransportFailure.ambiguousOutcome
        }
        let canonical = try GeneratedRemoteV3Contract.runtimeGapAcknowledgeResponse(data)
        return try JSONDecoding.decode(
            RemoteHistoryGapAcknowledgeWire.self, from: canonical
        ).project()
    }
}

// MARK: - Stable app-model decoding from canonical JSON

private struct RemoteHistoryGapReadWire: Decodable {
    var gap: RemoteHistoryGapDescriptor?
    var notice: RemoteHistoryNotice?

    func project() -> RemoteHistoryGapRead {
        RemoteHistoryGapRead(gap: gap, notice: notice)
    }
}

private struct RemoteHistoryGapAcknowledgeWire: Decodable {
    var outcome: String
    var notice: RemoteHistoryNotice?
    var descriptor: RemoteHistoryGapDescriptor?
    var current: RemoteHistoryGapDescriptor?
    var supersededAcceptedEvents: Int?

    func project() throws -> RemoteHistoryGapAcknowledgeOutcome {
        switch outcome {
        case "applied":
            guard let notice else { throw RichChatGatewayError.invalidResponse }
            return .applied(
                notice: notice,
                supersededAcceptedEvents: supersededAcceptedEvents ?? 0
            )
        case "already":
            guard let notice else { throw RichChatGatewayError.invalidResponse }
            return .already(notice: notice)
        case "stale":
            return .stale(current: current)
        default:
            throw RichChatGatewayError.invalidResponse
        }
    }
}
