import SwiftUI
import WidgetKit

/// Entry point for the PoracodeActivities widget extension. Only the Live
/// Activity is bundled today; add Home Screen / Lock Screen widgets here later.
@main
struct PoracodeActivitiesBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.2, *) {
            DesktopSessionLiveActivity()
        }
    }
}
