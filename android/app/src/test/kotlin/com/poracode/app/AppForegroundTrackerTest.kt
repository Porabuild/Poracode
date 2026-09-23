package com.poracode.app

import com.poracode.app.AppForegroundTracker.Transition
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Lifecycle-sequence tests for the started-activity counter behind the
 * app-level foreground/background fan-out. Each test replays the
 * ActivityLifecycleCallbacks orderings the Application wiring observes.
 */
class AppForegroundTrackerTest {

    @Test
    fun normalLaunchAndBackgroundFiresBothCrossings() {
        val tracker = AppForegroundTracker()
        assertEquals(Transition.NONE, tracker.onActivityCreated(isActivityRecreation = false))
        assertEquals(Transition.FOREGROUND, tracker.onStarted())
        assertEquals(Transition.BACKGROUND, tracker.onStopped(isChangingConfigurations = false))
    }

    @Test
    fun secondActivityStartAndStopNeverFanOut() {
        val tracker = AppForegroundTracker()
        assertEquals(Transition.FOREGROUND, tracker.onStarted())
        assertEquals(Transition.NONE, tracker.onStarted())
        assertEquals(Transition.NONE, tracker.onStopped(isChangingConfigurations = false))
        assertEquals(Transition.BACKGROUND, tracker.onStopped(isChangingConfigurations = false))
    }

    @Test
    fun recreateSwapStartsNewBeforeStoppingOldWithoutBackgroundFanOut() {
        // Deep-link relaunch with FLAG_ACTIVITY_CLEAR_TASK: the replacement
        // instance starts before the finishing instance stops, so the count
        // goes 1 -> 2 -> 1 and the swap must not fire either crossing.
        val tracker = AppForegroundTracker()
        assertEquals(Transition.FOREGROUND, tracker.onStarted())
        assertEquals(Transition.NONE, tracker.onActivityCreated(isActivityRecreation = false))
        assertEquals(Transition.NONE, tracker.onStarted())
        assertEquals(Transition.NONE, tracker.onStopped(isChangingConfigurations = false))
        // Backgrounding after the swap is still a real crossing.
        assertEquals(Transition.BACKGROUND, tracker.onStopped(isChangingConfigurations = false))
    }

    @Test
    fun configurationChangeRecreateFansOutNeitherDirection() {
        // Real recreate ordering: old instance stops with
        // isChangingConfigurations, its destruction is not observed, the
        // replacement re-initializes with saved state and starts.
        val tracker = AppForegroundTracker()
        assertEquals(Transition.FOREGROUND, tracker.onStarted())
        assertEquals(Transition.NONE, tracker.onStopped(isChangingConfigurations = true))
        assertEquals(Transition.NONE, tracker.onActivityCreated(isActivityRecreation = true))
        assertEquals(Transition.NONE, tracker.onStarted())
        // The swap left no phantom background, so the later stop fans out once.
        assertEquals(Transition.BACKGROUND, tracker.onStopped(isChangingConfigurations = false))
    }

    @Test
    fun freshLaunchAfterCancelledConfigurationChangeRecreateFiresForeground() {
        // The defect: the config-change stop set the pending marker, but the
        // recreate never landed while the process survived. The next genuine
        // launch creates a fresh activity (no saved state), which proves the
        // pending recreate is stale and must not swallow the foreground.
        val tracker = AppForegroundTracker()
        assertEquals(Transition.FOREGROUND, tracker.onStarted())
        assertEquals(Transition.NONE, tracker.onStopped(isChangingConfigurations = true))
        assertEquals(Transition.NONE, tracker.onActivityCreated(isActivityRecreation = false))
        assertEquals(Transition.FOREGROUND, tracker.onStarted())
        // The recovered launch still backgrounds normally afterwards.
        assertEquals(Transition.BACKGROUND, tracker.onStopped(isChangingConfigurations = false))
    }

    @Test
    fun freshLaunchAfterGenuineBackgroundDoesNotDisturbNextCrossing() {
        // A fresh create without a pending marker is the common launch path;
        // it must leave the next crossing untouched.
        val tracker = AppForegroundTracker()
        assertEquals(Transition.FOREGROUND, tracker.onStarted())
        assertEquals(Transition.BACKGROUND, tracker.onStopped(isChangingConfigurations = false))
        assertEquals(Transition.NONE, tracker.onActivityCreated(isActivityRecreation = false))
        assertEquals(Transition.FOREGROUND, tracker.onStarted())
    }

    @Test
    fun unbalancedStopsAreClampedWithoutStateCorruption() {
        val tracker = AppForegroundTracker()
        // An unbalanced stop (even one claiming a configuration change) must
        // neither fan out nor arm the pending marker.
        assertEquals(Transition.NONE, tracker.onStopped(isChangingConfigurations = false))
        assertEquals(Transition.NONE, tracker.onStopped(isChangingConfigurations = true))
        assertEquals(Transition.NONE, tracker.onActivityCreated(isActivityRecreation = true))
        assertEquals(Transition.FOREGROUND, tracker.onStarted())
    }
}
