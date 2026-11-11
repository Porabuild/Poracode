import Foundation

/// Terminal device-query handling split out of `RichChatTerminalController` to
/// keep that file under the source-size budget. See `TerminalQueryResponder`.
extension RichChatTerminalController {
  /// Routes a cursor frame's payload to the query responder: live `output`
  /// answers device-attribute/status queries, while `baseline` replay only
  /// advances the tracked cursor (mirroring `terminalQuerySuppression`).
  func offerCursorFrameToQueryResponder(_ frame: TerminalCursorFrame) {
    switch frame.kind {
    case .baseline: queryResponder.offerBaseline(frame.data)
    case .output: queryResponder.offerLive(frame.data)
    }
  }

  func resetQueryResponder() {
    queryResponder.reset()
  }
}
