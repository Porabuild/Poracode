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

// MARK: - Streaming URLSession data task

/// Cancellation-aware streaming fetch that receives body data in URLSession chunks
/// and enforces `maxBytes` before the next chunk is retained.
enum StreamingHTTPBody {
    static func perform(
        session: URLSession,
        request: URLRequest,
        maxBytes: Int
    ) async throws -> (Data, URLResponse) {
        let box = StreamingBodyBox(maxBytes: maxBytes)
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<(Data, URLResponse), Error>) in
                // Preserve the caller's configuration (URLProtocol test fakes, timeouts).
                box.start(baseSession: session, request: request, continuation: cont)
            }
        } onCancel: {
            box.cancel()
        }
    }
}

/// Retains the URLSession task + delegate for the lifetime of one streaming request.
private final class StreamingBodyBox: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private let maxBytes: Int
    private let lock = NSLock()
    private var data = Data()
    private var response: URLResponse?
    private var continuation: CheckedContinuation<(Data, URLResponse), Error>?
    private var task: URLSessionDataTask?
    private var privateSession: URLSession?
    private var finished = false

    init(maxBytes: Int) {
        self.maxBytes = maxBytes
    }

    func start(
        baseSession: URLSession,
        request: URLRequest,
        continuation: CheckedContinuation<(Data, URLResponse), Error>
    ) {
        lock.lock()
        guard !finished else {
            lock.unlock()
            continuation.resume(throwing: CancellationError())
            return
        }
        self.continuation = continuation
        // Copy caller configuration so URLProtocol stubs and timeouts still apply.
        // Dedicated session so this object is the data delegate for chunk callbacks.
        let config = (baseSession.configuration.copy() as? URLSessionConfiguration)
            ?? URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = request.timeoutInterval
        config.timeoutIntervalForResource = max(
            config.timeoutIntervalForResource,
            request.timeoutInterval
        )
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        privateSession = session
        let task = session.dataTask(with: request)
        self.task = task
        lock.unlock()
        task.resume()
    }

    func urlSession(
        _: URLSession,
        task _: URLSessionTask,
        willPerformHTTPRedirection _: HTTPURLResponse,
        newRequest _: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        // Match production redirect-denying policy for the streaming session.
        completionHandler(nil)
    }

    func cancel() {
        lock.lock()
        task?.cancel()
        finishLocked(error: CancellationError())
        lock.unlock()
    }

    func urlSession(
        _: URLSession,
        dataTask _: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        lock.lock()
        self.response = response
        if let http = response as? HTTPURLResponse,
           let lengthHeader = http.value(forHTTPHeaderField: "Content-Length"),
           let declared = Int(lengthHeader),
           BoundedResponseReader.rejectDeclaredLength(declared, maxBytes: maxBytes) {
            finishLocked(
                error: RemoteClientError(
                    message: "Remote response body too large.",
                    status: http.statusCode,
                    code: "response_too_large"
                )
            )
            lock.unlock()
            completionHandler(.cancel)
            return
        }
        lock.unlock()
        completionHandler(.allow)
    }

    func urlSession(_: URLSession, dataTask _: URLSessionDataTask, didReceive chunk: Data) {
        lock.lock()
        defer { lock.unlock() }
        guard !finished else { return }
        do {
            data = try BoundedResponseReader.appendChunk(
                existing: data,
                chunk: chunk,
                maxBytes: maxBytes
            )
        } catch {
            task?.cancel()
            finishLocked(error: error)
        }
    }

    func urlSession(_: URLSession, task _: URLSessionTask, didCompleteWithError error: Error?) {
        lock.lock()
        defer { lock.unlock() }
        if let error {
            if (error as? URLError)?.code == .cancelled || Task.isCancelled {
                finishLocked(error: CancellationError())
            } else {
                finishLocked(error: error)
            }
            return
        }
        guard let response else {
            finishLocked(error: RemoteClientError.invalidResponse("Missing HTTP response."))
            return
        }
        finishLocked(result: (data, response))
    }

    private func finishLocked(result: (Data, URLResponse)? = nil, error: Error? = nil) {
        guard !finished else { return }
        finished = true
        let cont = continuation
        continuation = nil
        let session = privateSession
        privateSession = nil
        task = nil
        if let error {
            session?.invalidateAndCancel()
            cont?.resume(throwing: error)
        } else if let result {
            session?.finishTasksAndInvalidate()
            cont?.resume(returning: result)
        }
    }
}
