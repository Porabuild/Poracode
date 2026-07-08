package com.lightcodeapp.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reports whether Firebase Cloud Messaging is configured in this build.
 *
 * The google-services Gradle plugin only generates the `google_app_id` string
 * resource when android/app/google-services.json is present (see
 * app/build.gradle — builds without it are supported, push just stays off).
 * In such a build, PushNotifications.register() throws on the Capacitor
 * bridge thread ("Default FirebaseApp is not initialized") and kills the
 * process before any JS catch can run, so the web layer asks this plugin
 * first and skips push registration entirely.
 */
@CapacitorPlugin(name = "PushSupport")
public class PushSupportPlugin extends Plugin {

    @PluginMethod
    public void isConfigured(PluginCall call) {
        int resId = getContext()
            .getResources()
            .getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("configured", resId != 0);
        call.resolve(result);
    }
}
