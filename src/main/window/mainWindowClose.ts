export interface MainWindowCloseLifecycleOptions {
  isQuitting(): boolean;
  closeToTrayEnabled(): boolean;
  hide(): void;
  markQuitting(): void;
  quit(): void;
}

export interface MainWindowCloseLifecycle {
  handleClose(event: Pick<Electron.Event, "preventDefault">): void;
  handleClosed(): void;
}

export function createMainWindowCloseLifecycle(
  options: MainWindowCloseLifecycleOptions,
): MainWindowCloseLifecycle {
  let quitAfterClose = false;

  return {
    handleClose(event) {
      if (options.isQuitting()) return;

      if (options.closeToTrayEnabled()) {
        event.preventDefault();
        options.hide();
        return;
      }

      options.markQuitting();
      quitAfterClose = true;
    },
    handleClosed() {
      if (!quitAfterClose) return;
      quitAfterClose = false;
      options.quit();
    },
  };
}
