const readline = require("node:readline");

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const request = JSON.parse(line);
  const respond = (response) => process.stdout.write(`${JSON.stringify(response)}\n`);
  switch (request.action) {
    case "hello":
      if (process.env.FAKE_HELPER_EXIT_ON_HELLO === "1") {
        process.exit(3);
      }
      respond({
        id: request.id,
        ok: true,
        result: {
          protocolVersion: Number(process.env.FAKE_HELPER_PROTOCOL ?? 1),
          minClientProtocolVersion: 1,
          helperVersion: "fixture",
          platform: "win32",
          arch: "x64",
          displayServer: null,
          capabilities: {
            backgroundPointer: true,
            backgroundKeyboard: true,
            backgroundChords: false,
            accessibilityTree: true,
            elementActions: true,
            occludedCapture: true,
            foregroundInput: true,
            launchApp: true,
            stableWindowIds: false,
          },
          permissions: { accessibility: "not_required", screenRecording: "not_required" },
          notes: ["fixture"],
        },
      });
      break;
    case "echo":
      setTimeout(
        () => respond({ id: request.id, ok: true, result: request.input.value }),
        request.input.delay ?? 0,
      );
      break;
    case "fail":
      respond({ id: request.id, ok: false, error: "fixture failure", code: "fixture_code" });
      break;
    case "noise":
      process.stdout.write("not json\n");
      respond({ id: request.id, ok: true, result: "after noise" });
      break;
    case "oversized":
      process.stdout.write("x".repeat(request.input.bytes));
      break;
    case "hang":
      break;
    case "click":
    case "type_text":
    case "press_key":
    case "scroll":
    case "drag":
    case "activate_window": {
      const mode =
        request.action === "activate_window" ? "foreground" : (request.input.mode ?? "background");
      respond({
        id: request.id,
        ok: true,
        result:
          request.input.x < 0
            ? {
                ok: false,
                mode: "interactive",
                window: request.input.window,
                refused: {
                  code: "background_unavailable",
                  reason: "fixture refusal",
                  hint: "retry foreground",
                },
              }
            : {
                ok: true,
                mode: "interactive",
                window: request.input.window,
                delivery: {
                  delivered: mode,
                  route: mode === "foreground" ? "input" : "message",
                  verified: "unverified",
                },
              },
      });
      break;
    }
    case "find_elements":
      respond({
        id: request.id,
        ok: true,
        result: {
          snapshotId: "s1",
          truncated: false,
          elements: [
            {
              id: "s1:0",
              role: "button",
              bounds: { x: 1, y: 2, width: 3, height: 4 },
              enabled: true,
              focused: false,
              offscreen: false,
              actions: ["invoke"],
              depth: 0,
            },
          ],
        },
      });
      break;
    default:
      respond({ id: request.id, ok: true, result: null });
  }
});
