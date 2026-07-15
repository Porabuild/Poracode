import { buildAcpComposerControls } from "../composerControlBuilders";
import { registerComposerControls } from "../providerComposer";

registerComposerControls("acp-generic", buildAcpComposerControls);
