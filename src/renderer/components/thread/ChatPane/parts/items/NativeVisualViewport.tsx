import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollShadow } from "@heroui/react";

export function NativeVisualViewport({
  children,
  zoom,
  fitToWidth,
  label,
  onZoomChange,
}: {
  children: ReactNode;
  zoom: number;
  fitToWidth: boolean;
  label: string;
  onZoomChange: (zoom: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ available: 0, minimum: 0 });
  useLayoutEffect(() => {
    if (!fitToWidth || !viewport.current || !content.current) return;
    const container = viewport.current;
    const body = content.current;
    const intrinsic = [...body.querySelectorAll<HTMLElement>(".number-field")];
    function measure() {
      const minimum = Math.max(
        0,
        ...intrinsic.map((element) => {
          let width = element.offsetWidth;
          for (
            let parent = element.parentElement;
            parent && parent !== body;
            parent = parent.parentElement
          ) {
            const style = getComputedStyle(parent);
            width +=
              (Number.parseFloat(style.paddingLeft) || 0) +
              (Number.parseFloat(style.paddingRight) || 0);
          }
          return width;
        }),
      );
      const available = container.clientWidth;
      setSize((previous) =>
        previous.available === available && previous.minimum === minimum
          ? previous
          : { available, minimum },
      );
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const element of intrinsic) observer.observe(element);
    measure();
    return () => observer.disconnect();
  });
  const width = Math.max(size.available, size.minimum);
  const scale = fitToWidth && size.available > 0 ? size.available / width : zoom / 100;
  useLayoutEffect(() => onZoomChange(scale * 100), [onZoomChange, scale]);
  return (
    <ScrollShadow
      ref={viewport}
      orientation="horizontal"
      role="region"
      aria-label={label}
      {...(fitToWidth ? {} : { tabIndex: 0 })}
      className={`min-w-0 ${fitToWidth ? "overflow-visible" : "focus-visible:outline-2 focus-visible:outline-accent"}`}
    >
      <div
        ref={content}
        data-native-visual-zoom={scale * 100}
        className={
          fitToWidth
            ? "[&_svg[role=img]]:h-auto [&_svg[role=img]]:min-w-0 [&_svg[role=img]]:max-w-full"
            : undefined
        }
        style={{ zoom: scale, ...(fitToWidth && width > 0 ? { width } : {}) }}
      >
        {children}
      </div>
    </ScrollShadow>
  );
}
