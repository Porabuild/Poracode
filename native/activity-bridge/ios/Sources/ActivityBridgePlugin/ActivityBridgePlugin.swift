import ActivityKit
import Capacitor
import Foundation

/// Capacitor 8 bridge to ActivityKit. Registered as `ActivityBridge` on the JS
/// side. Everything is guarded by availability checks so the plugin compiles
/// and loads on the Capacitor 8 default deployment target (iOS 14) while only
/// touching ActivityKit on iOS 16.2+ (push-to-start on 17.2+).
@objc(ActivityBridgePlugin)
public class ActivityBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ActivityBridgePlugin"
    public let jsName = "ActivityBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPushToStartToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endActivity", returnType: CAPPluginReturnPromise),
    ]

    private var observersStarted = false

    override public func load() {
        startActivityObservers()
    }

    // MARK: - isSupported

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            let enabled = ActivityAuthorizationInfo().areActivitiesEnabled
            var pushToStart = false
            if #available(iOS 17.2, *) {
                pushToStart = enabled
            }
            call.resolve([
                "liveActivities": enabled,
                "pushToStart": pushToStart,
            ])
        } else {
            call.resolve([
                "liveActivities": false,
                "pushToStart": false,
            ])
        }
    }

    // MARK: - getPushToStartToken

    @objc func getPushToStartToken(_ call: CAPPluginCall) {
        guard #available(iOS 17.2, *) else {
            call.resolve(["token": NSNull()])
            return
        }
        Task {
            let token = await Self.firstPushToStartToken(timeout: 3.0)
            call.resolve(["token": token ?? NSNull()])
        }
    }

    @available(iOS 17.2, *)
    private static func firstPushToStartToken(timeout: TimeInterval) async -> String? {
        await withTaskGroup(of: String?.self) { group in
            group.addTask {
                for await tokenData in Activity<DesktopSessionAttributes>.pushToStartTokenUpdates {
                    return tokenData.hexString
                }
                return nil
            }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                return nil
            }
            let result = await group.next() ?? nil
            group.cancelAll()
            return result
        }
    }

    // MARK: - startActivity

    @objc func startActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["activityId": NSNull()])
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.reject("Live Activities are not enabled on this device")
            return
        }
        guard
            let attributesDict = call.getObject("attributes"),
            let desktopId = attributesDict["desktopId"] as? String,
            let desktopName = attributesDict["desktopName"] as? String
        else {
            call.reject("Missing or invalid `attributes` (desktopId, desktopName)")
            return
        }
        guard let contentStateDict = call.getObject("contentState") else {
            call.reject("Missing `contentState`")
            return
        }

        let attributes = DesktopSessionAttributes(desktopId: desktopId, desktopName: desktopName)
        let state = DesktopSessionAttributes.ContentState(jsObject: contentStateDict)

        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: nil),
                pushType: .token
            )
            observe(activity: activity)
            call.resolve(["activityId": activity.id])
        } catch {
            call.reject("Failed to start Live Activity: \(error.localizedDescription)")
        }
    }

    // MARK: - endActivity

    @objc func endActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        let activityId = call.getString("activityId")
        let finalStateDict = call.getObject("contentState")

        Task {
            let dismissal = Date().addingTimeInterval(15 * 60)

            if
                let activityId,
                let activity = Activity<DesktopSessionAttributes>.activities.first(where: { $0.id == activityId })
            {
                let finalState = finalStateDict.map { DesktopSessionAttributes.ContentState(jsObject: $0) }
                    ?? activity.content.state
                await activity.end(
                    ActivityContent(state: finalState, staleDate: nil),
                    dismissalPolicy: .after(dismissal)
                )
            } else {
                for activity in Activity<DesktopSessionAttributes>.activities {
                    await activity.end(nil, dismissalPolicy: .after(dismissal))
                }
            }
            call.resolve()
        }
    }

    // MARK: - Listener: activity update tokens

    @objc override public func addListener(_ call: CAPPluginCall) {
        super.addListener(call)
        guard #available(iOS 16.2, *) else { return }
        // Re-emit the current token of every running activity so a freshly
        // attached JS listener can re-register tokens after an app relaunch.
        for activity in Activity<DesktopSessionAttributes>.activities {
            if let tokenData = activity.pushToken {
                notifyListeners("activityTokenUpdate", data: [
                    "activityId": activity.id,
                    "token": tokenData.hexString,
                ])
            }
        }
    }

    private func startActivityObservers() {
        guard !observersStarted else { return }
        observersStarted = true
        guard #available(iOS 16.2, *) else { return }

        for activity in Activity<DesktopSessionAttributes>.activities {
            observe(activity: activity)
        }
        Task { [weak self] in
            for await activity in Activity<DesktopSessionAttributes>.activityUpdates {
                self?.observe(activity: activity)
            }
        }
    }

    @available(iOS 16.2, *)
    private func observe(activity: Activity<DesktopSessionAttributes>) {
        Task { [weak self] in
            for await tokenData in activity.pushTokenUpdates {
                self?.notifyListeners("activityTokenUpdate", data: [
                    "activityId": activity.id,
                    "token": tokenData.hexString,
                ])
            }
        }
    }
}

// MARK: - JS-object decoding

@available(iOS 16.2, *)
extension DesktopSessionAttributes.ContentState {
    /// Builds a content state from the loosely-typed JS object Capacitor passes
    /// through `CAPPluginCall.getObject`. Mirrors the TS `ContentState` shape.
    init(jsObject: [String: Any]) {
        let runningCount = (jsObject["runningCount"] as? Int)
            ?? Int((jsObject["runningCount"] as? Double) ?? 0)
        let rawThreads = jsObject["threads"] as? [[String: Any]] ?? []
        self.init(runningCount: runningCount, threads: rawThreads.map { ThreadRow(jsObject: $0) })
    }
}

@available(iOS 16.2, *)
extension DesktopSessionAttributes.ContentState.ThreadRow {
    init(jsObject: [String: Any]) {
        let epochMs = (jsObject["startedAt"] as? Double)
            ?? Double((jsObject["startedAt"] as? Int) ?? 0)
        self.init(
            threadId: jsObject["threadId"] as? String ?? "",
            title: jsObject["title"] as? String ?? "",
            project: jsObject["project"] as? String ?? "",
            status: jsObject["status"] as? String ?? "idle",
            startedAt: Date(timeIntervalSince1970: epochMs / 1000)
        )
    }
}

// MARK: - Data hex encoding

extension Data {
    /// Lowercase hex string, the canonical form for APNs device/activity tokens.
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
