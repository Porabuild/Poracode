package com.poracode.app.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Settable presenter for the currently-visible heavy-review surface. The PR/review
 * UI calls [present] when it gains/loses the exact host/project/target lease;
 * the value flows into the single Git-interest computation.
 */
fun interface HeavyReviewInterestPresenter {
    fun present(target: HeavyReviewTarget?)
}

/**
 * Single source of truth for the heavy-review target. Host isolation is enforced
 * at emit time (the composer drops a target whose [HeavyReviewTarget.connectionId]
 * no longer matches the selected host), so a stale presenter call after a host
 * swap can never emit for the wrong host.
 */
class HeavyReviewInterestSource : HeavyReviewInterestPresenter {
    private val mutable = MutableStateFlow<HeavyReviewTarget?>(null)
    val state: StateFlow<HeavyReviewTarget?> = mutable.asStateFlow()

    override fun present(target: HeavyReviewTarget?) {
        mutable.value = target
    }

    fun current(): HeavyReviewTarget? = mutable.value
}
