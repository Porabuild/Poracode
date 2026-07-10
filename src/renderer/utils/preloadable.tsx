import { createElement, lazy, type ComponentType, type FunctionComponent } from "react";

export interface PreloadableComponent<Props extends object> extends FunctionComponent<Props> {
  preload: () => Promise<void>;
}

export function preloadable<Props extends object>(
  load: () => Promise<ComponentType<Props>>,
): PreloadableComponent<Props> {
  let resolved: ComponentType<Props> | null = null;
  let pending: Promise<ComponentType<Props>> | null = null;

  function loadComponent(): Promise<ComponentType<Props>> {
    if (resolved) return Promise.resolve(resolved);
    pending ??= load().then(
      (component) => {
        resolved = component;
        return component;
      },
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  }

  const LazyComponent = lazy(async () => ({ default: await loadComponent() }));

  function Preloadable(props: Props) {
    return createElement(resolved ?? LazyComponent, props);
  }

  return Object.assign(Preloadable, {
    preload: () => loadComponent().then(() => undefined),
  });
}
