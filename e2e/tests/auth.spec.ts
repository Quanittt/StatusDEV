import { expect, test } from "@playwright/test";
import { logout, signUp, uniqueEmail } from "./helpers";

test.describe("вхід і реєстрація", () => {
  test("реєстрація веде в кабінет, вихід закриває його", async ({ page }) => {
    await signUp(page, "Марина", uniqueEmail());
    await expect(page.getByRole("heading", { name: "Проєкти" })).toBeVisible();

    await logout(page);
    await expect(page).toHaveURL(/\/login$/);

    // без сесії кабінет недоступний
    await page.goto("/clients");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("вхід існуючого користувача, а хибний пароль дає помилку", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, "Олег", email);
    await logout(page);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Пароль").fill("wrong-password");
    await page.getByRole("button", { name: "Увійти" }).click();
    await expect(page.getByRole("alert")).toContainText("Невірний email або пароль");

    await page.getByLabel("Пароль").fill("password123");
    await page.getByRole("button", { name: "Увійти" }).click();
    await expect(page.getByRole("heading", { name: "Проєкти" })).toBeVisible();
  });

  test("повторна реєстрація з тим самим email відхиляється", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, "Перший", email);
    await logout(page);

    await page.goto("/signup");
    await page.getByLabel("Ім’я").fill("Другий");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Пароль").fill("password123");
    await page.getByRole("button", { name: "Зареєструватись" }).click();
    await expect(page.getByRole("alert")).toContainText("уже існує");
  });
});
