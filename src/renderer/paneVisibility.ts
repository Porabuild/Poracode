import { createContext } from "react";

/** Keep-alive panes share visibility with animations and image loading. */
export const PaneVisibility = createContext(true);
