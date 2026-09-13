import { execFile } from "node:child_process";
import { expect, it } from "vitest";
import { MacComputerUseDriver } from "./macos";
import { NativeProcessRunner } from "./nativeProcessRunner";

it("interrupts a multi-step native action before another command and permits a new user action", async () => {
  let launches = 0;
  let driver: MacComputerUseDriver;
  const processes = new NativeProcessRunner({
    launch(_command, _args, options, callback) {
      launches += 1;
      const current = launches;
      // Every requested macOS command is replaced by this owned Node fixture.
      // No osascript, native input or application launch occurs in this test.
      return execFile(
        process.execPath,
        [
          "-e",
          `process.stdout.write(JSON.stringify([{app:'Synthetic',pid:42,index:0,x:0,y:0,width:10,height:10}]));`,
        ],
        options,
        (error, stdout, stderr) => {
          callback(error, stdout, stderr);
          if (current === 2) driver.dispose();
        },
      );
    },
  });
  driver = new MacComputerUseDriver(processes);
  try {
    const [window] = await driver.listWindows();
    expect(window).toBeDefined();
    await expect(driver.click({ window: window!, x: 1, y: 1 })).rejects.toThrow("interrupted");
    expect(launches).toBe(2);
    await expect(driver.listWindows()).resolves.toHaveLength(1);
    expect(launches).toBe(3);
    await driver.close();
    await expect(driver.listWindows()).rejects.toThrow("closed");
    expect(launches).toBe(3);
  } finally {
    await driver.close();
  }
});
