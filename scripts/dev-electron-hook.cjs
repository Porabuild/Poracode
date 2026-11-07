const { app } = require("electron");

process.on("message", (message) => {
  if (message?.version === 1 && message.type === "poracode-dev-quit") app.quit();
});

process.on("disconnect", () => app.quit());
