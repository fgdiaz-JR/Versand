const { spawn } = require("node:child_process");

const services = ["operator", "buyer"].map((role) => {
  const child = spawn(process.execPath, ["backend/service.js", role], { stdio: "inherit" });
  child.on("exit", (code) => {
    if (code && !child.killed) console.error(`[${role}] finalizó con código ${code}`);
  });
  return child;
});

function shutdown(signal) {
  services.forEach((child) => child.kill(signal));
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
