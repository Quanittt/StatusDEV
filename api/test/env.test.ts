import { describe, expect, it } from "vitest";
import { describeEnvProblems } from "../src/env.js";

describe("звіт про змінні середовища", () => {
  it("називає змінну, причину й підказку", () => {
    const text = describeEnvProblems(
      {
        RESEND_API_KEY: ["Required"],
        BETTER_AUTH_SECRET: ["String must contain at least 32 character(s)"],
      },
      { BETTER_AUTH_SECRET: "short" },
      true,
    );
    expect(text).toContain("RESEND_API_KEY: не задано");
    expect(text).toContain("resend.com");
    expect(text).toContain("BETTER_AUTH_SECRET: невірне значення");
    expect(text).toContain("32");
    expect(text).not.toContain("Файлу api/.env немає");
  });

  it("підказує створити .env, якщо його немає", () => {
    const text = describeEnvProblems({ DATABASE_URL: ["Required"] }, {}, false);
    expect(text).toContain("cp api/.env.example api/.env");
    expect(text).toContain("DATABASE_URL: не задано");
  });
});
