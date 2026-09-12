import XCTest
@testable import App

final class PairingURLTests: XCTestCase {
    func testPhotoDecoderReadsFixedPairingQRCode() async throws {
        let encoded = "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"
        let data = try XCTUnwrap(Data(base64Encoded: encoded))

        let payload = try await PairingPhotoCodeDecoder.decode(data)

        XCTAssertEqual(
            payload,
            "https://desktop.example/#token=lc_pair_photo_test"
        )
    }

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
