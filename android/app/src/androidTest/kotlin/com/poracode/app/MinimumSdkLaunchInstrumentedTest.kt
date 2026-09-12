package com.poracode.app

import android.os.Build
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Keeps the declared Android 8/minSdk launch path covered independently of API 37 tests. */
@RunWith(AndroidJUnit4::class)
@SdkSuppress(maxSdkVersion = 26)
class MinimumSdkLaunchInstrumentedTest {
    @get:Rule val compose = createEmptyComposeRule()

    @Test
    fun coldLaunchShowsThePairingEntryPoint() {
        assertEquals(26, Build.VERSION.SDK_INT)
        val context = InstrumentationRegistry.getInstrumentation().targetContext

        ActivityScenario.launch(MainActivity::class.java).use {
            compose.onNodeWithText(context.getString(R.string.pair_scan_card_title))
                .assertIsDisplayed()
        }
    }
}
