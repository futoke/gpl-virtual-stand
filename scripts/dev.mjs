import { spawn } from "node:child_process";

const isWin = process.platform === "win32";
const children = [];

function run(name, command, args) {
  const child = isWin
    ? spawn("cmd.exe", ["/c", command, ...args], {
        cwd: process.cwd(),
        stdio: "inherit",
        windowsHide: false,
      })
    : spawn(command, args, {
        cwd: process.cwd(),
        stdio: "inherit",
      });

  child.on("exit", (code, signal) => {
    if (signal || code) {
      console.log(`[${name}] exited with ${signal ?? code}`);
    }
  });

  child.on("error", (error) => {
    console.error(`[${name}] failed: ${error.message}`);
  });

  children.push(child);
  return child;
}

function shutdown(exitCode) {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  process.exit(exitCode);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("server", "python", ["-m", "uvicorn", "backend.app:app", "--reload", "--port", "8000"]);
run("client", "npm.cmd", ["run", "dev:client"]);
