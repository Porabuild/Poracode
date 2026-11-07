import { useRef, useState } from "react";

/** Opens an option tooltip only when it adds something: a description, or the
 *  rest of a label that `truncate` cut off. */
export function useOverflowTooltip(hasDescription: boolean) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState({ isOpen: false, labelOverflows: false });
  return {
    labelRef,
    labelOverflows: state.labelOverflows,
    tooltipProps: {
      isOpen: state.isOpen,
      onOpenChange: (open: boolean) => {
        const label = labelRef.current;
        const labelOverflows = !!label && label.scrollWidth > label.clientWidth;
        setState({ isOpen: open && (hasDescription || labelOverflows), labelOverflows });
      },
    },
  };
}
