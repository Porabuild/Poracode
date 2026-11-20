"use client";

import { domMin, LazyMotion, MotionConfig } from "motion/react";
import type { ComponentProps } from "react";

export function AnimatedPage({ children, ...props }: ComponentProps<"div">) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domMin} strict>
        <div {...props}>{children}</div>
      </LazyMotion>
    </MotionConfig>
  );
}
