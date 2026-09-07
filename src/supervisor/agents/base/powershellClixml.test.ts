import { describe, expect, it } from "vitest";
import { decodePowerShellClixml } from "./powershellClixml";

describe("decodePowerShellClixml", () => {
  it("returns non-CLIXML text unchanged", () => {
    expect(decodePowerShellClixml("plain stderr\n")).toBe("plain stderr\n");
  });

  it("extracts error strings and decodes CLIXML escapes, entities, and ANSI", () => {
    const payload =
      '#< CLIXML\n<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04">' +
      "<S S=\"Error\">_x001B_[31;1m&amp;: _x001B_[31;1mThe term 'C:\\bin\\codex.cmd' is not recognized as a name of a cmdlet, function, script file, or executable program._x001B_[0m_x000D__x000A_</S>" +
      '<S S="Error">_x001B_[31;1mCheck the spelling of the name.&lt;ok&gt;_x001B_[0m_x000D__x000A_</S>' +
      "</Objs>";
    expect(decodePowerShellClixml(payload)).toBe(
      "&: The term 'C:\\bin\\codex.cmd' is not recognized as a name of a cmdlet, function, script file, or executable program.\n" +
        "Check the spelling of the name.<ok>",
    );
  });

  it("keeps text that preceded the CLIXML header", () => {
    const payload = 'warning line\n#< CLIXML\n<Objs><S S="Error">boom_x000D__x000A_</S></Objs>';
    expect(decodePowerShellClixml(payload)).toBe("warning line\nboom");
  });

  it("returns the input unchanged when the payload has no strings", () => {
    const payload = "#< CLIXML\n<Objs></Objs>";
    expect(decodePowerShellClixml(payload)).toBe(payload);
  });
});
