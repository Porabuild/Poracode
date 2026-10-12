import Foundation

extension URLRequest {
    /// Declaration from the native producer's compiled protocol, before transport.
    /// Read-class POSTs may carry it too; the host determines which routes write.
    mutating func declareCurrentRemoteWriterProtocol() {
        guard (httpMethod ?? "GET") != "GET", value(forHTTPHeaderField: "Authorization") != nil else { return }
        setValue(
            String(ProtocolConstants.remoteProtocolVersion),
            forHTTPHeaderField: ProtocolConstants.protocolVersionHeader
        )
    }
}
