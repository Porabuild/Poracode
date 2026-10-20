// Artifact-v1 private parent/child control. On Windows, process.kill(SIGTERM)
// bypasses JS handlers. Deliver the public CLI's graceful shutdown inside its
// owned child so capture/input resources can finish before the process exits.
function stop() {
  if (!process.emit("SIGTERM")) process.exit(0);
}

process.on("message", (message) => {
  if (message?.type === "device-hub-stop" && message.version === 1) stop();
});
process.once("disconnect", stop);
