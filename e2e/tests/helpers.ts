import { expect, type Page } from "@playwright/test";

let counter = 0;
export const uniqueEmail = () =>
  `e2e-${Date.now()}-${++counter}@example.com`;

export async function signUp(page: Page, name: string, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Ім’я").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill("password123");
  await page.getByRole("button", { name: "Зареєструватись" }).click();
  await expect(page.getByRole("heading", { name: "Проєкти" })).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Вийти" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export async function createClient(page: Page, name: string, email: string) {
  await page.goto("/clients");
  await page.getByLabel("Ім’я / компанія").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Додати клієнта" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

// Новий проєкт із шаблону; повертає адресу сторінки проєкту.
export async function createProject(
  page: Page,
  { client, title, template }: { client: string; title: string; template: string },
) {
  await page.goto("/projects/new");
  await page.getByLabel("Клієнт").selectOption({ label: client });
  await page.getByLabel("Назва").fill(title);
  await page.getByLabel("Шаблон етапів").selectOption({ label: template });
  await page.getByRole("button", { name: "Створити проєкт" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  return page.url();
}
