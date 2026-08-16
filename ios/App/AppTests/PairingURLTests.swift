import XCTest
@testable import App

final class PairingURLTests: XCTestCase {
    func testParsePairingURLWithTokenFragment() {
        let parts = PairingURL.parseParts("https://desktop.tailnet.ts.net/#token=lc_pair_test")
        XCTAssertEqual(parts?.token, "lc_pair_test")
        XCTAssertNil(parts?.host)
    }

    func testParseHostedPairingURL() {
        let parts = PairingURL.parseParts(
            "https://poracode.com/?host=https://desktop.example/base#token=lc_pair_test"
        )
        XCTAssertEqual(parts?.token, "lc_pair_test")
        XCTAssertEqual(parts?.host, "https://desktop.example/base")
    }

    func testParseMissingTokenReturnsNil() {
        XCTAssertNil(PairingURL.parseParts("https://desktop.example/"))
        XCTAssertNil(PairingURL.parseParts("not a url"))
    }

    func testNormalizeDesktopPairingURL() throws {
        let url = "https://desktop.tailnet.ts.net/#token=lc_pair_test"
        XCTAssertEqual(try PairingURL.normalizeEndpoint(url), "https://desktop.tailnet.ts.net")
    }

    func testNormalizeHostedPairingUsesHostParam() throws {
        let url = "https://poracode.com/?host=https://desktop.example/base#token=x"
        XCTAssertEqual(try PairingURL.normalizeEndpoint(url), "https://desktop.example/base")
    }

    func testNormalizeStripsAppSuffixes() throws {
        XCTAssertEqual(
            try PairingURL.normalizeEndpoint("https://host.example/app"),
            "https://host.example"
        )
        XCTAssertEqual(
            try PairingURL.normalizeEndpoint("https://host.example/pair"),
            "https://host.example"
        )
        XCTAssertEqual(
            try PairingURL.normalizeEndpoint("https://host.example/mobile.html"),
            "https://host.example"
        )
    }

    func testNormalizeViteDevPortRewritesToRemoteAccessPort() throws {
        XCTAssertEqual(
            try PairingURL.normalizeEndpoint("http://127.0.0.1:3100/"),
            "http://127.0.0.1:49152"
        )
    }

    func testNormalizePreservesPathPrefix() throws {
        XCTAssertEqual(
            try PairingURL.normalizeEndpoint("https://relay.example/s/server-1/"),
            "https://relay.example/s/server-1"
        )
    }

    func testToWebSocketBaseURL() throws {
        let https = try PairingURL.toWebSocketBaseURL(httpBase: "https://desktop.example")
        XCTAssertEqual(https.scheme, "wss")
        let http = try PairingURL.toWebSocketBaseURL(httpBase: "http://192.168.1.10:49152")
        XCTAssertEqual(http.scheme, "ws")
    }

    func testCleartextLanDetection() {
        XCTAssertTrue(PairingURL.isCleartextLanURL("http://192.168.1.20:49152"))
        XCTAssertFalse(PairingURL.isCleartextLanURL("http://127.0.0.1:49152"))
        XCTAssertFalse(PairingURL.isCleartextLanURL("https://desktop.example"))
        XCTAssertFalse(PairingURL.isCleartextLanURL("http://localhost:49152"))
    }

    func testNormalizeHostedHostParamWithRelayPath() throws {
        let url =
            "https://poracode.com/?host=https%3A%2F%2Frelay.example%2Fs%2Fserver-1#token=lc_pair_test"
        XCTAssertEqual(
            try PairingURL.normalizeEndpoint(url),
            "https://relay.example/s/server-1"
        )
    }

    func testNormalizeDevPortOnNonLoopback() throws {
        XCTAssertEqual(
            try PairingURL.normalizeEndpoint("http://192.168.1.9:3100/#token=x"),
            "http://192.168.1.9:49152"
        )
    }

    func testNormalizeRejectsNonHttpSchemeWithoutHostParam() {
        XCTAssertThrowsError(try PairingURL.normalizeEndpoint("ftp://example.com"))
        XCTAssertThrowsError(try PairingURL.normalizeEndpoint("poracode://pair"))
    }

    // MARK: - Custom scheme deep links

    func testParseCustomSchemeWithHostAndFragmentToken() {
        let raw =
            "poracode://pair?host=https%3A%2F%2Fdesktop.example%2Fbase#token=lc_pair_test"
        let parts = PairingURL.parseParts(raw)
        XCTAssertEqual(parts?.token, "lc_pair_test")
        XCTAssertEqual(parts?.host, "https://desktop.example/base")
    }

    func testParseCustomSchemeWithHostAndQueryToken() {
        let raw =
            "poracode://pair?host=https%3A%2F%2Fdesktop.example&token=lc_pair_query"
        let parts = PairingURL.parseParts(raw)
        XCTAssertEqual(parts?.token, "lc_pair_query")
        XCTAssertEqual(parts?.host, "https://desktop.example")
    }

    func testNormalizeCustomSchemeFollowsHostBeforeSchemeReject() throws {
        let raw =
            "poracode://pair?host=https%3A%2F%2Fdesktop.tailnet.ts.net%2Fs%2Fserver-1#token=x"
        // Must not treat outer host `pair` as the network endpoint.
        XCTAssertEqual(
            try PairingURL.normalizeEndpoint(raw),
            "https://desktop.tailnet.ts.net/s/server-1"
        )
    }

    func testCustomSchemeWithoutHostParamIsRejected() {
        XCTAssertThrowsError(
            try PairingURL.normalizeEndpoint("poracode://pair#token=x")
        )
        XCTAssertThrowsError(
            try PairingURL.normalizeEndpoint("poracode://pair?token=x")
        )
    }

    func testCanonicalHttpsPairAndAppSuffixes() throws {
        XCTAssertEqual(
            try PairingURL.normalizeEndpoint("https://poracode.com/pair#token=x"),
            "https://poracode.com"
        )
        XCTAssertEqual(
            try PairingURL.normalizeEndpoint("https://poracode.com/app#token=x"),
            "https://poracode.com"
        )
    }

    // MARK: - Deep-link validation (before tear-down)

    func testValidatedCandidateAcceptsHttpsTokenFragment() {
        let url = URL(string: "https://desktop.tailnet.ts.net/#token=lc_pair_test")!
        let candidate = PairingURL.validatedPairingCandidate(from: url)
        XCTAssertEqual(candidate?.pairingURLOrEmpty, url.absoluteString)
        XCTAssertEqual(candidate?.manualToken, "")
    }

    func testValidatedCandidateAcceptsCustomSchemeWithHost() {
        let url = URL(
            string: "poracode://pair?host=https%3A%2F%2Fdesktop.example&token=lc_pair_query"
        )!
        let candidate = PairingURL.validatedPairingCandidate(from: url)
        XCTAssertNotNil(candidate)
        if let candidate, !candidate.pairingURLOrEmpty.isEmpty {
            XCTAssertFalse(candidate.pairingURLOrEmpty.isEmpty)
        } else {
            XCTAssertEqual(candidate?.manualToken, "lc_pair_query")
            XCTAssertEqual(candidate?.manualBaseURL, "https://desktop.example")
        }
    }

    func testValidatedCandidateRejectsMalformedAndUnrelated() {
        XCTAssertNil(PairingURL.validatedPairingCandidate(from: URL(string: "https://example.com/")!))
        XCTAssertNil(PairingURL.validatedPairingCandidate(from: URL(string: "https://example.com/#foo=bar")!))
        XCTAssertNil(PairingURL.validatedPairingCandidate(from: URL(string: "poracode://pair")!))
        XCTAssertNil(PairingURL.validatedPairingCandidate(from: URL(string: "poracode://pair?token=x")!))
        XCTAssertNil(PairingURL.validatedPairingCandidate(from: URL(string: "not-a-url")!))
        XCTAssertNil(PairingURL.validatedPairingCandidate(from: URL(string: "ftp://x/#token=y")!))
    }

    func testValidatedCandidateAcceptsRelayHostedPairing() {
        let url = URL(
            string: "https://poracode.com/?host=https%3A%2F%2Frelay.example%2Fs%2Fserver-1#token=lc_pair_test"
        )!
        let candidate = PairingURL.validatedPairingCandidate(from: url)
        XCTAssertNotNil(candidate)
        XCTAssertEqual(
            try? PairingURL.normalizeEndpoint(candidate!.pairingURLOrEmpty.isEmpty
                ? candidate!.manualBaseURL
                : candidate!.pairingURLOrEmpty),
            "https://relay.example/s/server-1"
        )
    }
}
