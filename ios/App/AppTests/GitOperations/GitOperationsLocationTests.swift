import XCTest

@testable import App

final class GitOperationsLocationTests: XCTestCase {
  func testPOSIXAndWindowsPathsStayNative() {
    XCTAssertEqual(
      GitOperationLocation.worktreeLocation(
        path: "/work/one", relativeTo: GitOperationsSamples.posix),
      .posix(path: "/work/one", remoteServerId: "posix-host")
    )
    XCTAssertEqual(
      GitOperationLocation.worktreeLocation(
        path: #"D:\work\one"#,
        relativeTo: GitOperationsSamples.windows
      ),
      .windows(path: #"D:\work\one"#, remoteServerId: "windows-host")
    )
  }

  func testWSLKeepsLinuxAndUNCPathsDistinct() {
    let result = GitOperationLocation.worktreeLocation(
      path: "/home/dev/work/one",
      relativeTo: GitOperationsSamples.wsl
    )
    XCTAssertEqual(result.distro, "Ubuntu-24.04")
    XCTAssertEqual(result.linuxPath, "/home/dev/work/one")
    XCTAssertEqual(result.uncPath, #"\\wsl.localhost\Ubuntu-24.04\home\dev\work\one"#)
    XCTAssertEqual(result.remoteServerId, "wsl-host")
  }
}
