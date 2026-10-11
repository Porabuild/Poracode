import XCTest
import Security
@testable import App

final class KeychainSavePolicyTests: XCTestCase {
    func testUpdateSuccess() {
        XCTAssertEqual(KeychainSavePolicy.afterUpdate(errSecSuccess), .succeeded)
    }

    func testNotFoundPerformsAdd() {
        XCTAssertEqual(KeychainSavePolicy.afterUpdate(errSecItemNotFound), .performAdd)
    }

    func testOtherUpdateErrorFails() {
        XCTAssertEqual(KeychainSavePolicy.afterUpdate(errSecAuthFailed), .failed(errSecAuthFailed))
    }

    func testAddSuccess() {
        XCTAssertEqual(KeychainSavePolicy.afterAdd(errSecSuccess), .succeeded)
    }

    func testDuplicateAddRetriesUpdate() {
        XCTAssertEqual(KeychainSavePolicy.afterAdd(errSecDuplicateItem), .retryUpdateAfterDuplicate)
    }

    func testAddOtherErrorFails() {
        XCTAssertEqual(KeychainSavePolicy.afterAdd(errSecAuthFailed), .failed(errSecAuthFailed))
    }

    func testDuplicateRecoveryUpdateSuccess() {
        XCTAssertEqual(KeychainSavePolicy.afterDuplicateRecoveryUpdate(errSecSuccess), .succeeded)
    }

    func testDuplicateRecoveryUpdateFailure() {
        XCTAssertEqual(
            KeychainSavePolicy.afterDuplicateRecoveryUpdate(errSecAuthFailed),
            .failed(errSecAuthFailed)
        )
    }

    func testSystemKeychainIOUpdateThenAddThenDuplicateRetry() throws {
        let syscall = FakeKeychainSyscall()
        let io = SystemKeychainIO(service: "test.service", syscall: syscall)
        let payload = Data("secret".utf8)

        // update not found → add success
        syscall.updateResults = [errSecItemNotFound]
        syscall.addResults = [errSecSuccess]
        try io.save(account: "a", data: payload)
        XCTAssertEqual(syscall.updateCalls, 1)
        XCTAssertEqual(syscall.addCalls, 1)

        // update success
        syscall.resetCounts()
        syscall.updateResults = [errSecSuccess]
        try io.save(account: "a", data: payload)
        XCTAssertEqual(syscall.updateCalls, 1)
        XCTAssertEqual(syscall.addCalls, 0)

        // update not found → add duplicate → update success
        syscall.resetCounts()
        syscall.updateResults = [errSecItemNotFound, errSecSuccess]
        syscall.addResults = [errSecDuplicateItem]
        try io.save(account: "a", data: payload)
        XCTAssertEqual(syscall.updateCalls, 2)
        XCTAssertEqual(syscall.addCalls, 1)

        // Never deletes.
        XCTAssertEqual(syscall.deleteCalls, 0)
        XCTAssertEqual(syscall.lastAccessibility as String?, kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String)
    }

    func testSystemKeychainIODeleteAllTreatsMissingServiceAsCleared() throws {
        let syscall = FakeKeychainSyscall()
        syscall.deleteAllResults = [errSecItemNotFound]
        let io = SystemKeychainIO(service: "test.service", syscall: syscall)

        try io.deleteAll()

        XCTAssertEqual(syscall.deleteCalls, 1)
    }
}

final class FakeKeychainSyscall: KeychainSyscall, @unchecked Sendable {
    var updateResults: [OSStatus] = []
    var addResults: [OSStatus] = []
    var deleteAllResults: [OSStatus] = []
    var updateCalls = 0
    var addCalls = 0
    var deleteCalls = 0
    var lastAccessibility: CFString?

    func resetCounts() {
        updateCalls = 0
        addCalls = 0
        deleteCalls = 0
    }

    func update(account: String, service: String, data: Data, accessibility: CFString) -> OSStatus {
        _ = account
        _ = service
        _ = data
        lastAccessibility = accessibility
        updateCalls += 1
        if updateResults.isEmpty { return errSecSuccess }
        return updateResults.removeFirst()
    }

    func add(account: String, service: String, data: Data, accessibility: CFString) -> OSStatus {
        _ = account
        _ = service
        _ = data
        lastAccessibility = accessibility
        addCalls += 1
        if addResults.isEmpty { return errSecSuccess }
        return addResults.removeFirst()
    }

    func copyMatching(account: String, service: String) -> (OSStatus, Data?) {
        _ = account
        _ = service
        return (errSecItemNotFound, nil)
    }

    func delete(account: String, service: String) -> OSStatus {
        _ = account
        _ = service
        deleteCalls += 1
        return errSecSuccess
    }

    func deleteAll(service: String) -> OSStatus {
        _ = service
        deleteCalls += 1
        if deleteAllResults.isEmpty { return errSecSuccess }
        return deleteAllResults.removeFirst()
    }
}
