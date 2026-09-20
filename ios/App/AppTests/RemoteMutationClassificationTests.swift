import XCTest

@testable import App

/// Table-driven coverage for the central mutation-ambiguity classification.
///
/// Mutations are submitted exactly once. A post-send failure whose outcome cannot be
/// established (HTTP >= 500, status 0 / network / timeout, invalid response after send)
/// must classify as `requestMayHaveCommitted`; 4xx / scope / validation failures and all
/// read failures stay definite.
final class RemoteMutationClassificationTests: XCTestCase {
    func testPostSendMutationClassificationTable() {
        let cases: [(status: Int, code: String?, expected: RemoteMutationClassification)] = [
            (500, nil, .requestMayHaveCommitted),
            (502, nil, .requestMayHaveCommitted),
            (503, nil, .requestMayHaveCommitted),
            (504, nil, .requestMayHaveCommitted),
            (599, "server", .requestMayHaveCommitted),
            (0, nil, .requestMayHaveCommitted),
            (0, "network", .requestMayHaveCommitted),
            (200, "network", .requestMayHaveCommitted),
            (200, "timeout", .requestMayHaveCommitted),
            (200, nil, .definiteFailure),
            (304, nil, .definiteFailure),
            (400, nil, .definiteFailure),
            (400, "invalid_request", .definiteFailure),
            (401, "unauthorized", .definiteFailure),
            (403, nil, .definiteFailure),
            (404, nil, .definiteFailure),
            (409, "conflict", .definiteFailure),
            (422, "validation", .definiteFailure),
        ]
        for row in cases {
            let label = "status=\(row.status) code=\(row.code ?? "nil")"
            XCTAssertEqual(
                RemoteMutationClassification.classify(statusCode: row.status, code: row.code),
                row.expected,
                label
            )
            XCTAssertEqual(
                RemoteMutationClassification.isAmbiguous(statusCode: row.status, code: row.code),
                row.expected == .requestMayHaveCommitted,
                "isAmbiguous \(label)"
            )
        }
    }

    func testRemoteClientErrorClassificationAfterSubmission() {
        let ambiguous: [RemoteClientError] = [
            RemoteClientError(message: "server error", status: 500, code: "internal"),
            RemoteClientError(message: "unavailable", status: 503, code: "unavailable"),
            RemoteClientError(message: "dropped", status: 0, code: "network"),
            RemoteClientError(message: "slow", status: 0, code: "timeout"),
            RemoteClientError.invalidResponse("bad payload"),
        ]
        for error in ambiguous {
            XCTAssertEqual(
                RemoteMutationClassification.classify(
                    statusCode: error.status, code: error.code),
                .requestMayHaveCommitted,
                "\(error)"
            )
        }
        let definite: [RemoteClientError] = [
            RemoteClientError(message: "bad request", status: 400, code: "invalid_request"),
            RemoteClientError(message: "forbidden", status: 403, code: "forbidden"),
            RemoteClientError(message: "expired", status: 401, code: "unauthorized"),
            RemoteClientError(message: "conflict", status: 409, code: "conflict"),
        ]
        for error in definite {
            XCTAssertEqual(
                RemoteMutationClassification.classify(
                    statusCode: error.status, code: error.code),
                .definiteFailure,
                "\(error)"
            )
        }
    }

    func testReadFailuresAreAlwaysDefinite() {
        for status in [0, 200, 304, 400, 401, 403, 404, 500, 502, 503, 504] {
            XCTAssertEqual(
                RemoteMutationClassification.classifyRead(statusCode: status),
                .definiteFailure,
                "read status=\(status)"
            )
            XCTAssertEqual(
                RemoteMutationClassification.classifyRead(statusCode: status, code: "network"),
                .definiteFailure,
                "read status=\(status) code=network"
            )
        }
    }

    func testTransportDropIsAmbiguous() {
        XCTAssertEqual(RemoteMutationClassification.transportDrop, .requestMayHaveCommitted)
    }
}
