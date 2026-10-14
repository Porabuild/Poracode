package com.poracode.build;

import com.android.ddmlib.AdbInitOptions;
import com.android.ddmlib.AndroidDebugBridge;
import com.android.ddmlib.IDevice;
import com.android.tools.deployer.DeployerRunner;
import com.android.tools.deployer.common.UIService;
import com.android.utils.StdLogger;
import java.io.File;
import java.util.Arrays;
import java.util.concurrent.TimeUnit;

/**
 * Stable CLI entry point around Google's APK deployer.
 *
 * <p>The upstream command-line main starts deploying as soon as ADB has a device list. DDMLib's
 * JDWP client list arrives asynchronously, so a short-lived CLI can otherwise report a successful
 * overlay update without attaching the JVMTI agent to the running app. This launcher waits for the
 * requested debug process before handing the official deployer its device.
 */
public final class PoracodeAndroidDeployer {
    private static final long DISCOVERY_TIMEOUT_MILLIS = TimeUnit.SECONDS.toMillis(30);

    private PoracodeAndroidDeployer() {}

    public static void main(String[] args) throws Exception {
        String command = args[0];
        String serial = flag(args, "--device=");
        String adb = flag(args, "--adb=");
        String packageName = args[args.length - 2];
        File cache = new File(requiredProperty("poracode.android.deployer.cache"));
        if (!cache.isDirectory() && !cache.mkdirs()) {
            throw new IllegalStateException("Could not create APK deployer cache " + cache);
        }

        AndroidDebugBridge.init(AdbInitOptions.builder().setClientSupportEnabled(true).build());
        AndroidDebugBridge bridge = AndroidDebugBridge.createBridge(adb, false);
        try {
            IDevice device = waitForDevice(bridge, serial);
            if (command.equals("codeswap")) waitForDebugProcess(device, packageName);

            DeployerRunner runner =
                    new DeployerRunner(
                            new File(cache, "deploy.db"),
                            new File(cache, "dex.db"),
                            new AlwaysYesService());
            int result = runner.run(device, args, new StdLogger(StdLogger.Level.INFO));
            if (result != 0) System.exit(result);
        } finally {
            AndroidDebugBridge.terminate();
        }
    }

    private static IDevice waitForDevice(AndroidDebugBridge bridge, String serial)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + DISCOVERY_TIMEOUT_MILLIS;
        while (System.currentTimeMillis() < deadline) {
            if (bridge.hasInitialDeviceList()) {
                for (IDevice device : bridge.getDevices()) {
                    if (device.isOnline() && serial.equals(device.getSerialNumber())) return device;
                }
            }
            Thread.sleep(50);
        }
        throw new IllegalStateException("Timed out waiting for Android device " + serial);
    }

    private static void waitForDebugProcess(IDevice device, String packageName)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + DISCOVERY_TIMEOUT_MILLIS;
        while (System.currentTimeMillis() < deadline) {
            boolean found =
                    Arrays.stream(device.getClients())
                            .anyMatch(
                                    client ->
                                            packageName.equals(
                                                    client.getClientData().getPackageName()));
            if (found) return;
            Thread.sleep(50);
        }
        throw new IllegalStateException(
                "Timed out waiting for debuggable process "
                        + packageName
                        + "; launch it through dev:android first");
    }

    private static String flag(String[] args, String prefix) {
        return Arrays.stream(args)
                .filter(value -> value.startsWith(prefix))
                .map(value -> value.substring(prefix.length()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Missing " + prefix + " argument"));
    }

    private static String requiredProperty(String name) {
        String value = System.getProperty(name);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Missing " + name + " system property");
        }
        return value;
    }

    private static final class AlwaysYesService implements UIService {
        @Override
        public boolean prompt(String message) {
            return true;
        }

        @Override
        public void message(String message) {
            System.err.println(message);
        }
    }
}
