import { describe, expect, it } from "vitest";
import { normalizeMunicipalAdministrator, normalizeMunicipalityDraft } from "@/lib/platform-policy.mjs";

describe("platform administrator inputs", () => {
  it("normalizes a municipality draft", () => {
    expect(normalizeMunicipalityDraft({ name: "  Monte   Santo ", stateCode: "ba", slug: "Monte-Santo-BA" }))
      .toEqual({ name: "Monte Santo", stateCode: "BA", slug: "monte-santo-ba" });
  });

  it("normalizes the municipal Admin Master email and municipality id", () => {
    expect(normalizeMunicipalAdministrator({
      municipalityId: "91FE865E-0398-479E-A8A2-F5631BBD8E58",
      email: "  Admin@Prefeitura.BA.GOV.BR ",
    })).toEqual({
      municipalityId: "91fe865e-0398-479e-a8a2-f5631bbd8e58",
      email: "admin@prefeitura.ba.gov.br",
    });
  });

  it.each([
    [{ municipalityId: "not-a-uuid", email: "admin@example.org" }, /município válido/],
    [{ municipalityId: "91fe865e-0398-479e-a8a2-f5631bbd8e58", email: "email-inválido" }, /e-mail válido/],
  ])("rejects invalid registration data", (input, message) => {
    expect(() => normalizeMunicipalAdministrator(input)).toThrow(message);
  });
});
