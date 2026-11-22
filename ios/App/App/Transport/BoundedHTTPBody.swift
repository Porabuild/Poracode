import Foundation

// MARK: - Bounded response body

/// Incremental body reader with a hard byte cap (64 MiB default).
/// Production path uses cancellation-aware chunk delivery — never a per-byte AsyncBytes loop
/// and never full unbounded buffering of lying/chunked bodies.
enum BoundedResponseReader {
    /// Pure incremental check for tests / streamers (no network).
    static func appendChunk(
        existing: Data,
        chunk: Data,
        maxBytes: Int
    ) throws -> Data {
        if existing.count + chunk.count > maxBytes {
            throw RemoteClientError(
                message: "Remote response body too large.",
                status: 0,
                code: "response_too_large"
            )
        }
        var next = existing
        next.append(chunk)
        return next
    }

    /// Declared Content-Length must not exceed the cap.
    static func rejectDeclaredLength(_ declared: Int, maxBytes: Int) -> Bool {
        declared > maxBytes
    }

    /// Read a finite sequence of chunks with the same cap semantics as production.
    static func readChunks(
        _ chunks: [Data],
        maxBytes: Int
    ) throws -> Data {
        var data = Data()
        data.reserveCapacity(min(maxBytes, 65_536))
        for chunk in chunks {
            try Task.checkCancellation()
            data = try appendChunk(existing: data, chunk: chunk, maxBytes: maxBytes)
        }
        return data
    }
}

// MARK: - Pooled streaming URLSession data tasks

/// Cancellation-aware streaming fetch that multiplexes requests onto a pooled
/// `URLSession` (preserving HTTP/1.1 & HTTP/2 keep-alive connections and TLS
/// session reuse) while enforcing `maxBytes` per chunk, redirect refusal, and
/// TLS leaf pinning.
enum StreamingHTTPBody {
    static func configureTimeouts(
        _ configuration: URLSessionConfiguration,
        request: URLRequest,
        resourceTimeout: TimeInterval?
    ) {
        configuration.timeoutIntervalForRequest = request.timeoutInterval
        configuration.timeoutIntervalForResource = min(
            resourceTimeout ?? configuration.timeoutIntervalForResource,
            RemoteSocketPolicy.streamingBodyResourceTimeoutSeconds
        )
    }

    static func perform(
        session: URLSession,
        request: URLRequest,
        maxBytes: Int,
        resourceTimeout: TimeInterval? = nil,
        usesPairingPins: Bool = true,
        retryableSafeRead: Bool = false
    ) async throws -> (Data, URLResponse) {
        let isSafeGet = retryableSafeRead && request.httpMethod?.uppercased() == "GET"
        var attempt = 0
        while true {
            do {
                return try await performOnce(
                    session: session,
                    request: request,
                    maxBytes: maxBytes,
                    resourceTimeout: resourceTimeout,
                    usesPairingPins: usesPairingPins
                )
            } catch let failure as StreamingAttemptFailure {
                if isSafeGet,
                   attempt == 0,
                   !failure.receivedResponseHeaders,
                   !Task.isCancelled,
                   isStaleKeepAliveDrop(failure.underlying, url: request.url)
                {
                    attempt += 1
                    continue
                }
                throw failure.underlying
            }
        }
    }

    private static func isStaleKeepAliveDrop(_ error: Error, url: URL?) -> Bool {
        if let url, TlsCertPinStore.lastDecisionMismatched(endpoint: url.absoluteString) {
            return false
        }
        guard let urlError = error as? URLError else { return false }
        return urlError.code == .networkConnectionLost
    }

    private static func performOnce(
        session: URLSession,
        request: URLRequest,
        maxBytes: Int,
        resourceTimeout: TimeInterval?,
        usesPairingPins: Bool
    ) async throws -> (Data, URLResponse) {
        let leased = StreamingSessionPool.shared.multiplexer(
            for: session,
            request: request,
            resourceTimeout: resourceTimeout,
            usesPairingPins: usesPairingPins
        )
        let handle = StreamingTaskHandle()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation {
                (cont: CheckedContinuation<(Data, URLResponse), Error>) in
                leased.multiplexer.start(
                    request: request,
                    maxBytes: maxBytes,
                    handle: handle,
                    invalidateOnComplete: leased.invalidateOnComplete,
                    continuation: cont
                )
            }
        } onCancel: {
            handle.cancel()
        }
    }
}

private struct StreamingAttemptFailure: Error {
    let underlying: Error
    let receivedResponseHeaders: Bool
}

private final class StreamingTaskHandle: @unchecked Sendable {
    private let lock = NSLock()
    private var cancelled = false
    private var onCancel: (() -> Void)?

    func install(_ cancelAction: @escaping () -> Void) -> Bool {
        lock.lock()
        if cancelled {
            lock.unlock()
            cancelAction()
            return false
        }
        onCancel = cancelAction
        lock.unlock()
        return true
    }

    func cancel() {
        lock.lock()
        cancelled = true
        let action = onCancel
        onCancel = nil
        lock.unlock()
        action?()
    }
}

/// Process-lifetime pool of multiplexed `URLSession`s so production requests
/// share persistent keep-alive sockets and TLS sessions instead of spinning up
/// a fresh `URLSession` per HTTP call. Custom `URLProtocol` test configurations
/// stay isolated by their protocol class list.
private final class StreamingSessionPool: @unchecked Sendable {
    static let shared = StreamingSessionPool()

    private struct PoolKey: Hashable {
        let usesPairingPins: Bool
        let resourceTimeoutSeconds: Int
        let protocolClasses: [String]
        let hasURLCache: Bool
    }

    private let lock = NSLock()
    private var multiplexers: [PoolKey: StreamingSessionMultiplexer] = [:]

    private static let defaultProtocolClasses: [String] =
        (URLSessionConfiguration.ephemeral.protocolClasses ?? []).map { NSStringFromClass($0) }

    func multiplexer(
        for baseSession: URLSession,
        request: URLRequest,
        resourceTimeout: TimeInterval?,
        usesPairingPins: Bool
    ) -> (multiplexer: StreamingSessionMultiplexer, invalidateOnComplete: Bool) {
        let baseConfig = baseSession.configuration
        let protocols = (baseConfig.protocolClasses ?? []).map { NSStringFromClass($0) }
        let hasCustomProtocols = protocols != Self.defaultProtocolClasses
        let hasCustomHeaders = !(baseConfig.httpAdditionalHeaders?.isEmpty ?? true)
        if hasCustomProtocols || hasCustomHeaders {
            // Preserve custom URLProtocol test sessions and custom headers verbatim.
            let config = (baseConfig.copy() as? URLSessionConfiguration)
                ?? URLSessionConfiguration.ephemeral
            StreamingHTTPBody.configureTimeouts(
                config,
                request: request,
                resourceTimeout: resourceTimeout
            )
            return (
                StreamingSessionMultiplexer(configuration: config, usesPairingPins: usesPairingPins),
                true
            )
        }
        let effectiveResourceTimeout = min(
            resourceTimeout ?? baseConfig.timeoutIntervalForResource,
            RemoteSocketPolicy.streamingBodyResourceTimeoutSeconds
        )
        let key = PoolKey(
            usesPairingPins: usesPairingPins,
            resourceTimeoutSeconds: max(1, Int(effectiveResourceTimeout.rounded())),
            protocolClasses: protocols,
            hasURLCache: baseConfig.urlCache != nil
        )
        lock.lock()
        defer { lock.unlock() }
        if let existing = multiplexers[key] {
            return (existing, false)
        }
        let config = (baseConfig.copy() as? URLSessionConfiguration)
            ?? URLSessionConfiguration.ephemeral
        StreamingHTTPBody.configureTimeouts(
            config,
            request: request,
            resourceTimeout: resourceTimeout
        )
        config.httpMaximumConnectionsPerHost = max(config.httpMaximumConnectionsPerHost, 24)
        let created = StreamingSessionMultiplexer(
            configuration: config,
            usesPairingPins: usesPairingPins
        )
        if multiplexers.count >= 16 {
            multiplexers.removeAll(keepingCapacity: true)
        }
        multiplexers[key] = created
        return (created, false)
    }
}

/// Single `URLSessionDataDelegate` multiplexing concurrent tasks over one pooled
/// `URLSession`. Each task keeps isolated chunk accumulation, byte cap, and
/// continuation state keyed by `task.taskIdentifier`.
private final class StreamingSessionMultiplexer: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private final class TaskState {
        let maxBytes: Int
        let invalidateOnComplete: Bool
        var data = Data()
        var response: URLResponse?
        var receivedResponseHeaders = false
        var continuation: CheckedContinuation<(Data, URLResponse), Error>?
        weak var task: URLSessionDataTask?
        var finished = false

        init(
            maxBytes: Int,
            invalidateOnComplete: Bool,
            continuation: CheckedContinuation<(Data, URLResponse), Error>
        ) {
            self.maxBytes = maxBytes
            self.invalidateOnComplete = invalidateOnComplete
            self.continuation = continuation
        }
    }

    private let usesPairingPins: Bool
    private let lock = NSLock()
    private var states: [Int: TaskState] = [:]
    private var session: URLSession!

    init(configuration: URLSessionConfiguration, usesPairingPins: Bool) {
        self.usesPairingPins = usesPairingPins
        super.init()
        self.session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }

    func start(
        request: URLRequest,
        maxBytes: Int,
        handle: StreamingTaskHandle,
        invalidateOnComplete: Bool,
        continuation: CheckedContinuation<(Data, URLResponse), Error>
    ) {
        let task = session.dataTask(with: request)
        let taskID = task.taskIdentifier
        let state = TaskState(
            maxBytes: maxBytes,
            invalidateOnComplete: invalidateOnComplete,
            continuation: continuation
        )
        state.task = task

        lock.lock()
        states[taskID] = state
        lock.unlock()

        let active = handle.install { [weak self] in
            self?.cancelTask(id: taskID)
        }
        if active {
            task.resume()
        }
    }

    private func cancelTask(id: Int) {
        lock.lock()
        guard let state = states[id] else {
            lock.unlock()
            return
        }
        let task = state.task
        let shouldInvalidate = state.invalidateOnComplete
        let cont = finishLocked(id: id, state: state)
        lock.unlock()
        task?.cancel()
        if shouldInvalidate { session.invalidateAndCancel() }
        cont?.resume(throwing: CancellationError())
    }

    func urlSession(
        _: URLSession,
        task _: URLSessionTask,
        willPerformHTTPRedirection _: HTTPURLResponse,
        newRequest _: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }

    func urlSession(
        _: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        respond(to: challenge, completionHandler: completionHandler)
    }

    func urlSession(
        _: URLSession,
        task _: URLSessionTask,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        respond(to: challenge, completionHandler: completionHandler)
    }

    private func respond(
        to challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        if usesPairingPins {
            TlsServerTrustEvaluator.handle(challenge, completionHandler: completionHandler)
        } else {
            completionHandler(.performDefaultHandling, nil)
        }
    }

    func urlSession(
        _: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        lock.lock()
        guard let state = states[dataTask.taskIdentifier], !state.finished else {
            lock.unlock()
            completionHandler(.cancel)
            return
        }
        state.response = response
        state.receivedResponseHeaders = true
        if let http = response as? HTTPURLResponse,
           let lengthHeader = http.value(forHTTPHeaderField: "Content-Length"),
           let declared = Int(lengthHeader),
           BoundedResponseReader.rejectDeclaredLength(declared, maxBytes: state.maxBytes)
        {
            let cont = finishLocked(id: dataTask.taskIdentifier, state: state)
            lock.unlock()
            completionHandler(.cancel)
            cont?.resume(
                throwing: StreamingAttemptFailure(
                    underlying: RemoteClientError(
                        message: "Remote response body too large.",
                        status: http.statusCode,
                        code: "response_too_large"
                    ),
                    receivedResponseHeaders: true
                )
            )
            return
        }
        lock.unlock()
        completionHandler(.allow)
    }

    func urlSession(_: URLSession, dataTask: URLSessionDataTask, didReceive chunk: Data) {
        lock.lock()
        guard let state = states[dataTask.taskIdentifier], !state.finished else {
            lock.unlock()
            return
        }
        do {
            state.data = try BoundedResponseReader.appendChunk(
                existing: state.data,
                chunk: chunk,
                maxBytes: state.maxBytes
            )
            lock.unlock()
        } catch {
            let task = state.task
            let cont = finishLocked(id: dataTask.taskIdentifier, state: state)
            lock.unlock()
            task?.cancel()
            cont?.resume(
                throwing: StreamingAttemptFailure(
                    underlying: error,
                    receivedResponseHeaders: state.receivedResponseHeaders
                )
            )
        }
    }

    func urlSession(_: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        lock.lock()
        guard let state = states[task.taskIdentifier], !state.finished else {
            lock.unlock()
            return
        }
        let receivedHeaders = state.receivedResponseHeaders
        let shouldInvalidate = state.invalidateOnComplete
        let data = state.data
        let response = state.response
        let cont = finishLocked(id: task.taskIdentifier, state: state)
        lock.unlock()

        if let error {
            if shouldInvalidate { session.invalidateAndCancel() }
            let mapped: Error
            if let urlError = error as? URLError, urlError.code == .cancelled {
                mapped = Task.isCancelled ? CancellationError() : urlError
            } else if Task.isCancelled {
                mapped = CancellationError()
            } else {
                mapped = error
            }
            cont?.resume(
                throwing: StreamingAttemptFailure(
                    underlying: mapped,
                    receivedResponseHeaders: receivedHeaders
                )
            )
            return
        }
        if shouldInvalidate { session.finishTasksAndInvalidate() }
        guard let response else {
            cont?.resume(
                throwing: StreamingAttemptFailure(
                    underlying: RemoteClientError.invalidResponse("Missing HTTP response."),
                    receivedResponseHeaders: receivedHeaders
                )
            )
            return
        }
        cont?.resume(returning: (data, response))
    }

    private func finishLocked(
        id: Int,
        state: TaskState
    ) -> CheckedContinuation<(Data, URLResponse), Error>? {
        guard !state.finished else { return nil }
        state.finished = true
        states.removeValue(forKey: id)
        let cont = state.continuation
        state.continuation = nil
        state.task = nil
        return cont
    }
}
