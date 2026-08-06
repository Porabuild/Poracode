import Citadel
@testable import SshBridgePlugin
import XCTest

final class SshBridgePluginTests: XCTestCase {
    func testClassifiesAuthenticationFailuresSeparatelyFromTransportFailures() {
        XCTAssertEqual(
            sshConnectErrorCode(for: SSHClientError.allAuthenticationOptionsFailed),
            "SSH_AUTHENTICATION_FAILED"
        )
        XCTAssertEqual(
            sshConnectErrorCode(for: SSHClientError.unsupportedPrivateKeyAuthentication),
            "SSH_AUTHENTICATION_FAILED"
        )
        XCTAssertEqual(
            sshConnectErrorCode(for: DummyTransportError()),
            "SSH_CONNECT_FAILED"
        )
    }
}

private struct DummyTransportError: Error {}
