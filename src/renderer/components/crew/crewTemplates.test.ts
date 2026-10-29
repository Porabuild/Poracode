import { describe, expect, it } from "vitest";
import {
  CREW_ROLE_BRIEF_MAX_LENGTH,
  CREW_ROLE_LABEL_MAX_LENGTH,
  crewRoleIdSchema,
  MAX_CREW_ROLE_PARALLEL,
  MAX_CREW_ROLES,
} from "@/shared/crew";
import { CREW_ROLE_TEMPLATE_DESCRIPTORS } from "./crewRoleTemplates";
import { crewRoleTone } from "./CrewRolePill";
import { CREW_TEMPLATE_DESCRIPTORS } from "./crewTemplates";

describe("crew templates", () => {
  it("only reference ready roles that fit the saved crew schema", () => {
    for (const template of CREW_TEMPLATE_DESCRIPTORS) {
      expect(template.roles.length).toBeGreaterThan(0);
      expect(template.roles.length).toBeLessThanOrEqual(MAX_CREW_ROLES);
      const ids = template.roles.map((role) => role.roleId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const role of template.roles) {
        const descriptor = CREW_ROLE_TEMPLATE_DESCRIPTORS.find((entry) => entry.id === role.roleId);
        expect(descriptor, `${template.id} uses ${role.roleId}`).toBeDefined();
        expect(role.parallel ?? 1).toBeLessThanOrEqual(MAX_CREW_ROLE_PARALLEL);
      }
    }
  });

  it("keeps every ready role within the role id, label and brief limits", () => {
    for (const role of CREW_ROLE_TEMPLATE_DESCRIPTORS) {
      expect(crewRoleIdSchema.safeParse(role.id).success).toBe(true);
      expect(role.label.message?.length ?? 0).toBeLessThanOrEqual(CREW_ROLE_LABEL_MAX_LENGTH);
      expect(role.brief?.message?.length ?? 0).toBeLessThanOrEqual(CREW_ROLE_BRIEF_MAX_LENGTH);
    }
  });

  it("colors template roles like the role they resemble", () => {
    expect(crewRoleTone({ id: "fixer" }, false)).toBe("builder");
    expect(crewRoleTone({ id: "investigator" }, false)).toBe("scout");
    expect(crewRoleTone({ id: "tester" }, false)).toBe("reviewer");
    expect(crewRoleTone({ id: "my-role" }, false)).toBe("custom");
    expect(crewRoleTone({ id: "builder" }, true)).toBe("lead");
  });
});
