import Capacitor
import Citadel
import Crypto
import Foundation
import NIO
import NIOPosix
import NIOSSH

private let maxOutputBytes = 256 * 1024
private let eventLoopGroup = MultiThreadedEventLoopGroup(numberOfThreads: 1)

private struct ProbeAuthenticationComplete: Error {}
private struct InvalidHostKeyFingerprint: Error {}
private struct MissingConnection: Error {}

private final class RejectAuthentication: NIOSSHClientUserAuthenticationDelegate {
    func nextAuthenticationType(
        availableMethods: NIOSSHAvailableUserAuthenticationMethods,
        nextChallengePromise: EventLoopPromise<NIOSSHUserAuthenticationOffer?>
    ) {
        nextChallengePromise.fail(ProbeAuthenticationComplete())
    }
}

private final class HostKeyValidator: NIOSSHClientServerAuthenticationDelegate {
    private let expected: String?
    private let lock = NSLock()
    private var capturedFingerprint: String?
    private var capturedAlgorithm: String?

    init(expected: String?) {
        self.expected = expected
    }

    var result: (fingerprint: String, algorithm: String)? {
        lock.lock()
        defer { lock.unlock() }
        guard let capturedFingerprint, let capturedAlgorithm else { return nil }
        return (capturedFingerprint, capturedAlgorithm)
    }

    func validateHostKey(
        hostKey: NIOSSHPublicKey,
        validationCompletePromise: EventLoopPromise<Void>
    ) {
        var buffer = ByteBufferAllocator().buffer(capacity: 256)
        hostKey.write(to: &buffer)
        let keyData = Data(buffer.readableBytesView)
        let digest = Data(SHA256.hash(data: keyData))
        let fingerprint = "SHA256:" + digest.base64EncodedString().trimmingCharacters(in: CharacterSet(charactersIn: "="))
        var prefixBuffer = buffer
        let prefixLength = prefixBuffer.readInteger(as: UInt32.self).map(Int.init) ?? 0
        let algorithm = prefixBuffer.readString(length: prefixLength) ?? "SSH"
        lock.lock()
        capturedFingerprint = fingerprint
        capturedAlgorithm = algorithm
        lock.unlock()
        if expected == nil || expected == fingerprint {
            validationCompletePromise.succeed(())
        } else {
            validationCompletePromise.fail(InvalidHostKeyFingerprint())
        }
    }
}

private final class GlueHandler: ChannelDuplexHandler {
    typealias InboundIn = NIOAny
    typealias OutboundIn = NIOAny
    typealias OutboundOut = NIOAny

    private weak var partner: GlueHandler?
    private var context: ChannelHandlerContext?
    private var pendingRead = false

    static func matchedPair() -> (GlueHandler, GlueHandler) {
        let first = GlueHandler()
        let second = GlueHandler()
        first.partner = second
        second.partner = first
        return (first, second)
    }

    func handlerAdded(context: ChannelHandlerContext) {
        self.context = context
        if context.channel.isWritable { partner?.partnerBecameWritable() }
    }

    func handlerRemoved(context: ChannelHandlerContext) {
        self.context = nil
        self.partner = nil
    }

    func channelRead(context: ChannelHandlerContext, data: NIOAny) {
        partner?.context?.write(data, promise: nil)
    }

    func channelReadComplete(context: ChannelHandlerContext) {
        partner?.context?.flush()
    }

    func channelInactive(context: ChannelHandlerContext) {
        partner?.context?.close(promise: nil)
    }

    func userInboundEventTriggered(context: ChannelHandlerContext, event: Any) {
        if let event = event as? ChannelEvent, case .inputClosed = event {
            partner?.context?.close(mode: .output, promise: nil)
        } else {
            context.fireUserInboundEventTriggered(event)
        }
    }

    func errorCaught(context: ChannelHandlerContext, error: Error) {
        partner?.context?.close(promise: nil)
        context.close(promise: nil)
    }

    func channelWritabilityChanged(context: ChannelHandlerContext) {
        if context.channel.isWritable { partner?.partnerBecameWritable() }
    }

    func read(context: ChannelHandlerContext) {
        if partner?.context?.channel.isWritable == true {
            context.read()
        } else {
            pendingRead = true
        }
    }

    private func partnerBecameWritable() {
        if pendingRead {
            pendingRead = false
            context?.read()
        }
    }
}

private final class MobileSshConnection {
    let client: SSHClient
    private let lock = NSLock()
    private var listener: Channel?

    init(client: SSHClient) {
        self.client = client
    }

    func replaceListener(_ next: Channel) async throws {
        lock.lock()
        let previous = listener
        listener = next
        lock.unlock()
        if let previous { try await previous.close() }
    }

    func close() async {
        lock.lock()
        let listener = listener
        self.listener = nil
        lock.unlock()
        if let listener { try? await listener.close() }
        try? await client.close()
    }
}

@objc(SshBridgePlugin)
public class SshBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SshBridgePlugin"
    public let jsName = "SshBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "probeHostKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "run", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "upload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forward", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
    ]

    private let lock = NSLock()
    private var connections: [String: MobileSshConnection] = [:]

    @objc func probeHostKey(_ call: CAPPluginCall) {
        guard let host = requiredString(call, "host") else { return }
        let port = call.getInt("port") ?? 22
        Task {
            let validator = HostKeyValidator(expected: nil)
            do {
                _ = try await SSHClient.connect(
                    host: host,
                    port: port,
                    authenticationMethod: .custom(RejectAuthentication()),
                    hostKeyValidator: .custom(validator),
                    reconnect: .never,
                    group: eventLoopGroup,
                    connectTimeout: .seconds(15)
                )
            } catch {
                // Authentication is intentionally rejected after the host key is captured.
            }
            guard let result = validator.result else {
                call.reject("Unable to probe SSH host key.", "SSH_PROBE_FAILED")
                return
            }
            call.resolve(["fingerprint": result.fingerprint, "algorithm": result.algorithm])
        }
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard
            let connectionId = requiredString(call, "connectionId"),
            let host = requiredString(call, "host"),
            let username = requiredString(call, "username"),
            let fingerprint = requiredString(call, "hostKeyFingerprint"),
            let authentication = call.getObject("authentication")
        else { return }
        let port = call.getInt("port") ?? 22
        Task {
            do {
                let method = try makeAuthentication(username: username, input: authentication)
                let validator = HostKeyValidator(expected: fingerprint)
                let client = try await SSHClient.connect(
                    host: host,
                    port: port,
                    authenticationMethod: method,
                    hostKeyValidator: .custom(validator),
                    reconnect: .never,
                    group: eventLoopGroup,
                    connectTimeout: .seconds(15)
                )
                let state = MobileSshConnection(client: client)
                let previous = replaceConnection(connectionId, with: state)
                if let previous { await previous.close() }
                call.resolve()
            } catch {
                call.reject(error.localizedDescription, "SSH_CONNECT_FAILED", error)
            }
        }
    }

    @objc func run(_ call: CAPPluginCall) {
        guard
            let connectionId = requiredString(call, "connectionId"),
            let script = requiredString(call, "script")
        else { return }
        let args = call.getArray("args", String.self) ?? []
        let timeoutMs = call.getInt("timeoutMs") ?? 60_000
        Task {
            do {
                let state = try connection(connectionId)
                let result = try await runScript(
                    client: state.client,
                    script: script,
                    args: args,
                    timeoutMs: timeoutMs
                )
                call.resolve([
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "exitCode": result.exitCode,
                ])
            } catch {
                call.reject(error.localizedDescription, "SSH_COMMAND_FAILED", error)
            }
        }
    }

    @objc func upload(_ call: CAPPluginCall) {
        guard
            let connectionId = requiredString(call, "connectionId"),
            let remotePath = requiredString(call, "remotePath"),
            let base64 = requiredString(call, "base64"),
            let bytes = Data(base64Encoded: base64)
        else { return }
        Task {
            do {
                let state = try connection(connectionId)
                let sftp = try await state.client.openSFTP()
                do {
                    try await sftp.withFile(
                        filePath: remotePath,
                        flags: [.write, .create, .truncate]
                    ) { file in
                        try await file.write(ByteBuffer(data: bytes))
                    }
                    try await sftp.close()
                } catch {
                    try? await sftp.close()
                    throw error
                }
                call.resolve()
            } catch {
                call.reject(error.localizedDescription, "SSH_UPLOAD_FAILED", error)
            }
        }
    }

    @objc func forward(_ call: CAPPluginCall) {
        guard
            let connectionId = requiredString(call, "connectionId"),
            let remotePort = call.getInt("remotePort")
        else { return }
        Task {
            do {
                let state = try connection(connectionId)
                let listener = try await makeForwardListener(client: state.client, remotePort: remotePort)
                try await state.replaceListener(listener)
                guard let localPort = listener.localAddress?.port else {
                    throw InvalidHostKeyFingerprint()
                }
                call.resolve([
                    "endpoint": "http://127.0.0.1:\(localPort)/",
                    "localPort": localPort,
                ])
            } catch {
                call.reject(error.localizedDescription, "SSH_FORWARD_FAILED", error)
            }
        }
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        guard let connectionId = requiredString(call, "connectionId") else { return }
        Task {
            let state = removeConnection(connectionId)
            if let state { await state.close() }
            call.resolve()
        }
    }

    private func requiredString(_ call: CAPPluginCall, _ key: String) -> String? {
        guard let value = call.getString(key), !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.reject("Missing \(key).", "SSH_INVALID_INPUT")
            return nil
        }
        return value
    }

    private func replaceConnection(_ id: String, with state: MobileSshConnection) -> MobileSshConnection? {
        lock.lock()
        defer { lock.unlock() }
        return connections.updateValue(state, forKey: id)
    }

    private func removeConnection(_ id: String) -> MobileSshConnection? {
        lock.lock()
        defer { lock.unlock() }
        return connections.removeValue(forKey: id)
    }

    private func connection(_ id: String) throws -> MobileSshConnection {
        lock.lock()
        defer { lock.unlock() }
        guard let state = connections[id] else { throw MissingConnection() }
        return state
    }
}

private func makeAuthentication(username: String, input: [String: Any]) throws -> SSHAuthenticationMethod {
    switch input["kind"] as? String {
    case "password":
        guard let password = input["password"] as? String else { throw MissingConnection() }
        return .passwordBased(username: username, password: password)
    case "private-key":
        guard let privateKey = input["privateKey"] as? String else { throw MissingConnection() }
        let passphrase = (input["passphrase"] as? String).flatMap { $0.isEmpty ? nil : Data($0.utf8) }
        if let key = try? Curve25519.Signing.PrivateKey(sshEd25519: privateKey, decryptionKey: passphrase) {
            return .ed25519(username: username, privateKey: key)
        }
        let key = try Insecure.RSA.PrivateKey(sshRsa: privateKey, decryptionKey: passphrase)
        return .rsa(username: username, privateKey: key)
    default:
        throw MissingConnection()
    }
}

private func runScript(
    client: SSHClient,
    script: String,
    args: [String],
    timeoutMs: Int
) async throws -> (stdout: String, stderr: String, exitCode: Int) {
    let encoded = Data(script.utf8).base64EncodedString()
    let suffix = args.map(shellQuote).joined(separator: " ")
    let command = """
    LC_OUT=$(mktemp) || exit 120
    LC_ERR=$(mktemp) || { rm -f "$LC_OUT"; exit 121; }
    printf '%s' \(shellQuote(encoded)) | base64 -d | sh -s -- \(suffix) >"$LC_OUT" 2>"$LC_ERR"
    LC_STATUS=$?
    printf '%s\\n' "$LC_STATUS"
    base64 <"$LC_OUT" | tr -d '\\n'; printf '\\n'
    base64 <"$LC_ERR" | tr -d '\\n'; printf '\\n'
    rm -f "$LC_OUT" "$LC_ERR"
    exit 0
    """
    let output: ByteBuffer = try await withThrowingTaskGroup(of: ByteBuffer.self) { group in
        group.addTask {
            try await client.executeCommand(command, maxResponseSize: maxOutputBytes * 3, mergeStreams: true)
        }
        group.addTask {
            try await Task.sleep(nanoseconds: UInt64(max(timeoutMs, 1)) * 1_000_000)
            try? await client.close()
            throw CancellationError()
        }
        let result = try await group.next()!
        group.cancelAll()
        return result
    }
    let text = String(buffer: output)
    let lines = text.split(separator: "\n", omittingEmptySubsequences: false)
    guard lines.count >= 3, let exitCode = Int(lines[0]) else { throw MissingConnection() }
    let stdout = Data(base64Encoded: String(lines[1])).flatMap { String(data: $0, encoding: .utf8) } ?? ""
    let stderr = Data(base64Encoded: String(lines[2])).flatMap { String(data: $0, encoding: .utf8) } ?? ""
    return (stdout, stderr, exitCode)
}

private func makeForwardListener(client: SSHClient, remotePort: Int) async throws -> Channel {
    try await ServerBootstrap(group: eventLoopGroup)
        .serverChannelOption(ChannelOptions.socketOption(.so_reuseaddr), value: 1)
        .childChannelInitializer { localChannel in
            let promise = localChannel.eventLoop.makePromise(of: Void.self)
            Task {
                do {
                    let origin: SocketAddress
                    if let remoteAddress = localChannel.remoteAddress {
                        origin = remoteAddress
                    } else {
                        origin = try SocketAddress(ipAddress: "127.0.0.1", port: 0)
                    }
                    let (localGlue, remoteGlue) = GlueHandler.matchedPair()
                    _ = try await client.createDirectTCPIPChannel(
                        using: SSHChannelType.DirectTCPIP(
                            targetHost: "127.0.0.1",
                            targetPort: remotePort,
                            originatorAddress: origin
                        )
                    ) { remoteChannel in
                        remoteChannel.pipeline.addHandler(remoteGlue)
                    }
                    try await localChannel.pipeline.addHandler(localGlue).get()
                    promise.succeed(())
                } catch {
                    promise.fail(error)
                    localChannel.close(promise: nil)
                }
            }
            return promise.futureResult
        }
        .bind(host: "127.0.0.1", port: 0)
        .get()
}

private func shellQuote(_ value: String) -> String {
    "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
}
