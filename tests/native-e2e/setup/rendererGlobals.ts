// Foundation suites import renderer taxonomy helpers under the node environment.
// Some of their UI dependencies (`@dnd-kit/dom`) construct a ResizeObserver at
// module load, so provide the same inert stub the renderer test setup uses.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
