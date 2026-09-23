package com.poracode.app

/**
 * Pure started-activity counter behind the app-level foreground/background
 * fan-out. State only — the caller maps the returned transitions to fan-outs,
 * which keeps the counting logic unit-testable without an Application.
 */
class AppForegroundTracker {

    /** Fan-out decision for a lifecycle callback; [NONE] changes nothing. */
    enum class Transition { NONE, FOREGROUND, BACKGROUND }

    private var startedActivityCount = 0

    /**
     * Set when the last started activity stops only to be recreated for a
     * configuration change (locale, font scale, ...): the replacement's start
     * is not a new foreground, so neither crossing fans out.
     */
    private var pendingConfigurationChange = false

    /**
     * A recreation re-initializes with saved state, so a null
     * `savedInstanceState` create is a fresh launch, never the pending
     * recreation. If a configuration-change recreate was still pending, it
     * never landed in this process (the user closed the task in the
     * destroy→recreate window, or the system cancelled it) while the process
     * survived — the pending marker is stale, and letting the next 0→1 start
     * consume it would swallow the genuine launch's foreground fan-out. Only
     * an actual recreation may consume it, so a fresh launch drops the
     * marker here, before that launch's own start. Always [NONE]: creation
     * itself is never a crossing.
     */
    fun onActivityCreated(isActivityRecreation: Boolean): Transition {
        if (!isActivityRecreation) {
            pendingConfigurationChange = false
        }
        return Transition.NONE
    }

    fun onStarted(): Transition {
        startedActivityCount += 1
        if (startedActivityCount != 1) return Transition.NONE
        if (pendingConfigurationChange) {
            pendingConfigurationChange = false
            return Transition.NONE
        }
        return Transition.FOREGROUND
    }

    fun onStopped(isChangingConfigurations: Boolean): Transition {
        // Unbalanced callbacks must not crash the app; clamp instead.
        if (startedActivityCount == 0) return Transition.NONE
        startedActivityCount -= 1
        if (startedActivityCount != 0) return Transition.NONE
        if (isChangingConfigurations) {
            pendingConfigurationChange = true
            return Transition.NONE
        }
        return Transition.BACKGROUND
    }
}
