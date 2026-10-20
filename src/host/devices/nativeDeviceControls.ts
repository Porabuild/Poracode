import type { DeviceControl, DeviceControlState } from "@/shared/deviceWorkspace";
import { DeviceWorkspaceError } from "./deviceProcess";

type Command = (args: string[]) => Promise<Buffer>;

// adb reconstructs shell arguments on the device; host execFile alone is not
// sufficient for URLs. Package IDs and all remaining arguments are closed enums.
function quote(value: string): string {
  return `'${value.replace(/'/gu, "'\\''")}'`;
}

export async function runAndroidDeviceControl(
  run: Command,
  control: DeviceControl,
): Promise<DeviceControlState | undefined> {
  const shell = (args: string[]) => run(["shell", ...args]);
  switch (control.type) {
    case "read": {
      const values = await Promise.all([
        shell(["cmd", "uimode", "night"]),
        shell(["settings", "get", "system", "font_scale"]),
        shell(["settings", "get", "global", "animator_duration_scale"]),
        shell(["settings", "get", "global", "transition_animation_scale"]),
        shell(["settings", "get", "global", "window_animation_scale"]),
        shell(["settings", "get", "global", "wifi_on"]),
        shell(["settings", "get", "global", "mobile_data"]),
      ]);
      const [night, font, animator, transition, window, wifi, data] = values.map((value) =>
        value.toString().trim(),
      );
      const scale = Number(font);
      const mode = night?.match(/\bNight mode:\s*(yes|no|auto)\b/iu)?.[1]?.toLowerCase();
      const motion = [animator, transition, window];
      return {
        version: 1,
        ...(mode === "yes"
          ? { appearance: "dark" as const }
          : mode === "no"
            ? { appearance: "light" as const }
            : mode === "auto"
              ? { appearance: "system" as const }
              : {}),
        ...(Number.isFinite(scale) && scale > 0 && scale <= 10 ? { fontScale: scale } : {}),
        ...(motion.every((value) => value !== undefined && /^0(?:\.0+)?$/u.test(value))
          ? { reduceMotion: true }
          : motion.every((value) => value !== undefined && /^1(?:\.0+)?$/u.test(value))
            ? { reduceMotion: false }
            : {}),
        ...((wifi === "0" || wifi === "1") && (data === "0" || data === "1")
          ? { networkEnabled: wifi === "1" || data === "1" }
          : {}),
      };
    }
    case "appearance":
      await shell(["cmd", "uimode", "night", control.value === "dark" ? "yes" : "no"]);
      return;
    case "textSize":
      await shell([
        "settings",
        "put",
        "system",
        "font_scale",
        { small: "0.85", standard: "1.0", large: "1.15", extraLarge: "1.3" }[control.value],
      ]);
      return;
    case "orientation":
      await shell(["settings", "put", "system", "accelerometer_rotation", "1"]);
      await shell(["cmd", "window", "user-rotation", "free"]);
      await run([
        "emu",
        "sensor",
        "set",
        "acceleration",
        {
          portrait: "0:9.81:0",
          landscapeLeft: "9.81:0:0",
          upsideDown: "0:-9.81:0",
          landscapeRight: "-9.81:0:0",
        }[control.value],
      ]);
      return;
    case "reduceMotion":
      for (const setting of [
        "animator_duration_scale",
        "transition_animation_scale",
        "window_animation_scale",
      ])
        await shell(["settings", "put", "global", setting, control.enabled ? "0" : "1"]);
      return;
    case "network":
      await shell(["svc", "wifi", control.enabled ? "enable" : "disable"]);
      await shell(["svc", "data", control.enabled ? "enable" : "disable"]);
      return;
    case "location":
      await run(["emu", "geo", "fix", String(control.longitude), String(control.latitude)]);
      return;
    case "permission": {
      const api = Number((await shell(["getprop", "ro.build.version.sdk"])).toString().trim());
      if (
        !Number.isInteger(api) ||
        api < 23 ||
        (control.permission === "notifications" && api < 33) ||
        (control.permission === "motion" && api < 29)
      )
        throw new DeviceWorkspaceError(
          "device_control_unavailable",
          "This permission is unavailable on the selected Android version.",
        );
      const permissions: Record<typeof control.permission, string[]> = {
        camera: ["android.permission.CAMERA"],
        microphone: ["android.permission.RECORD_AUDIO"],
        photos: [
          api >= 33
            ? "android.permission.READ_MEDIA_IMAGES"
            : "android.permission.READ_EXTERNAL_STORAGE",
        ],
        contacts: ["android.permission.READ_CONTACTS", "android.permission.WRITE_CONTACTS"],
        calendar: ["android.permission.READ_CALENDAR", "android.permission.WRITE_CALENDAR"],
        location: [
          "android.permission.ACCESS_COARSE_LOCATION",
          "android.permission.ACCESS_FINE_LOCATION",
        ],
        notifications: ["android.permission.POST_NOTIFICATIONS"],
        motion: ["android.permission.ACTIVITY_RECOGNITION"],
      };
      for (const permission of permissions[control.permission])
        await shell(["pm", control.decision, control.applicationId, permission]);
      return;
    }
    case "openUrl":
      if (/^(?:javascript|data|file|content|intent|about):/iu.test(control.url))
        throw new DeviceWorkspaceError(
          "device_control_unavailable",
          "Use an HTTP URL or an app deep link.",
        );
      await shell(["am", "start", "-a", "android.intent.action.VIEW", "-d", quote(control.url)]);
      return;
    case "launchApp":
      await shell([
        "monkey",
        "-p",
        control.applicationId,
        "-c",
        "android.intent.category.LAUNCHER",
        "1",
      ]);
      return;
    case "powerOff":
      await run(["emu", "kill"]);
      return;
  }
}
