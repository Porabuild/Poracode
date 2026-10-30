import { setupI18n } from "@lingui/core";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/shared/locale";
import {
  CREW_NAME_MAX_LENGTH,
  CREW_ROLE_BRIEF_MAX_LENGTH,
  CREW_ROLE_LABEL_MAX_LENGTH,
  crewRoleIdSchema,
  MAX_CREW_ROLE_PARALLEL,
  MAX_CREW_ROLES,
} from "@/shared/crew";
import { CREW_ROLE_TEMPLATE_DESCRIPTORS, DEFAULT_CREW_ROLE_ID } from "./crewRoleTemplates";
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

  // A template's name and its roles' labels and briefs are copied into the
  // saved crew in the user's language, and the crew schema rejects any of
  // them past its limit.
  it.each(SUPPORTED_LOCALES)(
    "keeps every template name and ready role label and brief within the limits in %s",
    async (locale) => {
      const { messages } = (await import(`../../locales/${locale}/messages.po`)) as {
        messages: Record<string, string>;
      };
      const i18n = setupI18n({ locale, messages: { [locale]: messages } });
      for (const template of CREW_TEMPLATE_DESCRIPTORS) {
        const name = i18n._(template.name);
        expect(name.length, `${locale} ${template.id} name`).toBeGreaterThan(0);
        expect(name.length, `${locale} ${template.id} name`).toBeLessThanOrEqual(
          CREW_NAME_MAX_LENGTH,
        );
      }
      for (const role of CREW_ROLE_TEMPLATE_DESCRIPTORS) {
        const label = i18n._(role.label);
        expect(label.length, `${locale} ${role.id} label`).toBeGreaterThan(0);
        expect(label.length, `${locale} ${role.id} label`).toBeLessThanOrEqual(
          CREW_ROLE_LABEL_MAX_LENGTH,
        );
        if (!role.brief) continue;
        const brief = i18n._(role.brief);
        expect(brief.length, `${locale} ${role.id}`).toBeGreaterThan(0);
        expect(brief.length, `${locale} ${role.id}`).toBeLessThanOrEqual(
          CREW_ROLE_BRIEF_MAX_LENGTH,
        );
        const untranslated = locale !== "en" && brief === role.brief.message;
        expect(untranslated, `${locale} ${role.id} is untranslated`).toBe(false);
      }
    },
  );

  it("gives every ready role a brief and pairs the read-only review board with a sidekick", () => {
    expect(CREW_ROLE_TEMPLATE_DESCRIPTORS.every((role) => role.brief)).toBe(true);
    expect(CREW_TEMPLATE_DESCRIPTORS.find((template) => template.id === "review")?.roles).toEqual([
      { roleId: "reviewer", parallel: 2 },
      { roleId: DEFAULT_CREW_ROLE_ID },
    ]);
  });

  it("starts Lead + Sidekick with the role a New crew uses", () => {
    expect(CREW_TEMPLATE_DESCRIPTORS.find((template) => template.id === "pair")).toMatchObject({
      name: { message: "Lead + Sidekick" },
      policy: "crew-only",
      roles: [{ roleId: DEFAULT_CREW_ROLE_ID }],
    });
    expect(
      CREW_ROLE_TEMPLATE_DESCRIPTORS.find((role) => role.id === DEFAULT_CREW_ROLE_ID),
    ).toMatchObject({ label: { message: "Sidekick" }, tone: "builder" });
  });

  it("colors template roles like the role they resemble", () => {
    expect(crewRoleTone({ id: "fixer" }, false)).toBe("builder");
    expect(crewRoleTone({ id: "sidekick" }, false)).toBe("builder");
    expect(crewRoleTone({ id: "investigator" }, false)).toBe("scout");
    expect(crewRoleTone({ id: "tester" }, false)).toBe("reviewer");
    expect(crewRoleTone({ id: "my-role" }, false)).toBe("custom");
    expect(crewRoleTone({ id: "builder" }, true)).toBe("lead");
  });
});
