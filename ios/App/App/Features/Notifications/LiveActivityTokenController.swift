import ActivityKit
import Foundation

@MainActor
final class LiveActivityTokenController {
  private let registrations: PushRegistrationController
  private var started = false
  private var rootTasks: [Task<Void, Never>] = []
  private var activityTasks: [String: [Task<Void, Never>]] = [:]

  init(registrations: PushRegistrationController) {
    self.registrations = registrations
  }

  func start() {
    guard !started else { return }
    started = true

    for activity in Activity<DesktopSessionAttributes>.activities {
      observe(activity)
    }
    rootTasks.append(
      Task { [weak self] in
        for await activity in Activity<DesktopSessionAttributes>.activityUpdates {
          guard !Task.isCancelled else { return }
          self?.observe(activity)
        }
      })
    if #available(iOS 17.2, *) {
      rootTasks.append(
        Task { [weak self] in
          for await token in Activity<DesktopSessionAttributes>.pushToStartTokenUpdates {
            guard !Task.isCancelled, let self else { return }
            await self.registrations.receivePushToStartToken(token)
          }
        })
    }
  }

  func endActivities(for connectionId: ClientConnectionID) async {
    for activity in Activity<DesktopSessionAttributes>.activities {
      guard LiveActivityRouting.route(for: activity.attributes)?.clientConnectionId == connectionId
      else { continue }
      await activity.end(nil, dismissalPolicy: .immediate)
      cancelObservation(activity.id)
      await registrations.removeActivity(activity.id)
    }
  }

  func endAllActivities() async {
    for activity in Activity<DesktopSessionAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
      cancelObservation(activity.id)
      await registrations.removeActivity(activity.id)
    }
  }

  private func observe(_ activity: Activity<DesktopSessionAttributes>) {
    guard activityTasks[activity.id] == nil,
      let route = LiveActivityRouting.route(for: activity.attributes)
    else { return }

    var tasks: [Task<Void, Never>] = []
    if let token = activity.pushToken {
      tasks.append(
        Task { [registrations] in
          await registrations.receiveActivityToken(
            token,
            activityId: activity.id,
            route: route
          )
        })
    }
    tasks.append(
      Task { [weak self] in
        for await token in activity.pushTokenUpdates {
          guard !Task.isCancelled, let self else { return }
          await self.registrations.receiveActivityToken(
            token,
            activityId: activity.id,
            route: route
          )
        }
      })
    tasks.append(
      Task { [weak self] in
        for await state in activity.activityStateUpdates {
          guard !Task.isCancelled, let self else { return }
          if state == .ended || state == .dismissed {
            await self.registrations.removeActivity(activity.id)
            self.cancelObservation(activity.id)
            return
          }
        }
      })
    activityTasks[activity.id] = tasks
  }

  private func cancelObservation(_ activityId: String) {
    activityTasks.removeValue(forKey: activityId)?.forEach { $0.cancel() }
  }
}

enum LiveActivityRouting {
  static func route(for attributes: DesktopSessionAttributes) -> PushRegistrationRoute? {
    guard let routing = attributes.routing,
      routing.version == NotificationRoute.version,
      routing.desktopId == attributes.desktopId,
      let connectionId = ClientConnectionID(rawValue: routing.clientConnectionId),
      NotificationRouteValidation.validIdentifier(routing.desktopId)
    else { return nil }
    return PushRegistrationRoute(
      version: routing.version,
      clientConnectionId: connectionId,
      desktopId: routing.desktopId
    )
  }
}
