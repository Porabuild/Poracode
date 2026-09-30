import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installElectronClientRuntime,
  __setDesktopLoopbackIntakeTestSeamsForTest,
} from "@/renderer/clientRuntime";
import {
  bootstrapPayloadFor,
  electronHost,
  setupManagedRootFixture,
  socketUrls,
  startFixtureServer,
  teardownManagedRootFixture,
  wsSocketFactory,
} from "@/renderer/state/managedRootCatalog/managedRootFixture";
import {
  DesktopLoopbackIntake,
  type DesktopLoopbackIntakeDeps,
} from "@/renderer/state/remoteServers/desktopLoopbackIntake";
import { readManagedLoopbackProcedureHost } from "@/renderer/remoteProcedureRouter";
import {
  isDesktopLoopbackIntakeActive,
  readManagedLoopbackActivation,
  resetDesktopLoopbackIntakeForTest,
  startDesktopLoopbackEventIntake,
} from "./loopbackHttpWsTransport";

describe("managed loopback intake startup ownership", () => {
  beforeEach(setupManagedRootFixture);
  afterEach(async () => {
    vi.restoreAllMocks();
    await teardownManagedRootFixture();
  });

  function install(bootstrap: Parameters<typeof electronHost>[0]): void {
    installElectronClientRuntime(electronHost(bootstrap));
    __setDesktopLoopbackIntakeTestSeamsForTest({
      socketFactory: wsSocketFactory,
      retryDelayMs: 50,
    });
  }

  it("shares held bootstrap and establishes exactly one real socket", async () => {
    const server = await startFixtureServer();
    const bootstrap = Promise.withResolvers<ReturnType<typeof bootstrapPayloadFor>>();
    const getBootstrap = vi.fn<() => typeof bootstrap.promise>(() => bootstrap.promise);
    install(getBootstrap);
    const first = startDesktopLoopbackEventIntake();
    const second = startDesktopLoopbackEventIntake();
    expect(second).toBe(first);
    await vi.waitFor(() => expect(getBootstrap).toHaveBeenCalledTimes(1));
    bootstrap.resolve(bootstrapPayloadFor(server));
    await Promise.all([first, second]);
    await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true));
    expect(socketUrls).toHaveLength(1);
  });

  it("ignores a retired bootstrap result after a replacement activates", async () => {
    const server = await startFixtureServer();
    const oldBootstrap = Promise.withResolvers<ReturnType<typeof bootstrapPayloadFor>>();
    const getOldBootstrap = vi.fn<() => typeof oldBootstrap.promise>(() => oldBootstrap.promise);
    install(getOldBootstrap);
    const oldStart = startDesktopLoopbackEventIntake();
    await vi.waitFor(() => expect(getOldBootstrap).toHaveBeenCalledTimes(1));
    resetDesktopLoopbackIntakeForTest();
    install(() => bootstrapPayloadFor(server));
    await startDesktopLoopbackEventIntake();
    await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true));
    const replacement = readManagedLoopbackActivation();
    oldBootstrap.resolve(bootstrapPayloadFor(server));
    await oldStart;
    expect(readManagedLoopbackActivation()).toBe(replacement);
    expect(socketUrls).toHaveLength(1);
  });

  it("retired intake callbacks cannot clear the replacement registration", async () => {
    const server = await startFixtureServer();
    const created: DesktopLoopbackIntake[] = [];
    const activate = DesktopLoopbackIntake.prototype.activate;
    vi.spyOn(DesktopLoopbackIntake.prototype, "activate").mockImplementation(
      function (this: DesktopLoopbackIntake) {
        created.push(this);
        return activate.call(this);
      },
    );
    install(() => bootstrapPayloadFor(server));
    await startDesktopLoopbackEventIntake();
    await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true));
    const retired = created[0]!;
    resetDesktopLoopbackIntakeForTest();
    install(() => bootstrapPayloadFor(server));
    await startDesktopLoopbackEventIntake();
    await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true));
    const activation = readManagedLoopbackActivation();
    const registration = readManagedLoopbackProcedureHost();
    const dependencies = Reflect.get(retired, "deps") as DesktopLoopbackIntakeDeps;
    dependencies.onActiveChanged?.(false);
    dependencies.onTerminalLost?.();
    dependencies.onItemInterestsApplied?.([]);
    dependencies.onResyncRequired?.();
    expect(readManagedLoopbackActivation()).toBe(activation);
    expect(readManagedLoopbackProcedureHost()).toBe(registration);
    expect(isDesktopLoopbackIntakeActive()).toBe(true);
  });

  it("can recover during activation while the retired factory is still pending", async () => {
    const server = await startFixtureServer();
    const retiredActivation = Promise.withResolvers<void>();
    vi.spyOn(DesktopLoopbackIntake.prototype, "activate").mockImplementationOnce(
      async function (this: DesktopLoopbackIntake) {
        const dependencies = Reflect.get(this, "deps") as DesktopLoopbackIntakeDeps;
        dependencies.onCredentialExhausted?.();
        await retiredActivation.promise;
        return false;
      },
    );
    const getBootstrap = vi.fn<() => ReturnType<typeof bootstrapPayloadFor>>(() =>
      bootstrapPayloadFor(server),
    );
    install(getBootstrap);
    const oldStart = startDesktopLoopbackEventIntake();
    await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true));
    expect(getBootstrap).toHaveBeenCalledTimes(2);
    retiredActivation.resolve();
    await oldStart;
    expect(isDesktopLoopbackIntakeActive()).toBe(true);
    expect(socketUrls).toHaveLength(1);
  });
});
