import { expect, test } from "@playwright/test";
import { createClient, createProject, signUp, uniqueEmail } from "./helpers";

test("власник створює проєкт із шаблону й ділиться порталом, клієнт працює без акаунта", async ({
  page,
  browser,
}) => {
  await signUp(page, "Власниця", uniqueEmail());
  await createClient(page, "Смачна кава", "cafe@example.com");

  // 1. Проєкт із шаблону «Лендинг»: 6 етапів з готовими діями для клієнта
  await createProject(page, {
    client: "Смачна кава",
    title: "Лендинг кав'ярні",
    template: "Лендинг",
  });
  await expect(page.getByRole("button", { name: "Видалити етап" })).toHaveCount(6);
  await expect(page.getByText("Потрібно від клієнта:").first()).toBeVisible();

  // 2. Перший етап: очікує -> в роботі -> готово
  const firstPill = page.getByTitle("Змінити статус етапу").first();
  await firstPill.click();
  await expect(firstPill).toContainText("В роботі");
  await firstPill.click();
  await expect(firstPill).toContainText("Готово");

  // 3. Посилання для клієнта з паролем
  await page.getByRole("button", { name: "Створити посилання" }).click();
  const link = page.getByLabel("Посилання для клієнта");
  await expect(link).toHaveValue(/\/p\//);
  const portalUrl = await link.inputValue();

  await page.getByPlaceholder("Мінімум 6 символів").fill("secret123");
  await page.getByRole("button", { name: "Задати" }).click();
  await expect(page.getByText("Зараз: пароль встановлено")).toBeVisible();

  // 4. Клієнт відкриває портал у чистому контексті (без cookie власника)
  const clientCtx = await browser.newContext({ locale: "uk-UA" });
  const client = await clientCtx.newPage();
  await client.goto(portalUrl);

  await expect(client.getByRole("heading", { name: "Проєкт захищено паролем" })).toBeVisible();
  await client.getByLabel("Пароль").fill("wrong-password");
  await client.getByRole("button", { name: "Відкрити" }).click();
  await expect(client.getByRole("alert")).toContainText("Невірний пароль");

  await client.getByLabel("Пароль").fill("secret123");
  await client.getByRole("button", { name: "Відкрити" }).click();
  await expect(client.getByRole("heading", { name: "Лендинг кав'ярні" })).toBeVisible();
  await expect(client.getByText("1 з 6 етапів")).toBeVisible();

  // 5. Клієнт приймає готовий етап і пише коментар
  await client.getByRole("button", { name: "Прийнято" }).first().click();
  await expect(client.getByText("✓ Ви прийняли цей етап")).toBeVisible();

  await client.getByLabel("Ваш коментар").fill("Дякую, все чудово!");
  await client.getByRole("button", { name: "Надіслати", exact: true }).click();
  await expect(client.getByText("Надіслано. Власник побачить ваш коментар.")).toBeVisible();
  await expect(client.getByText("Дякую, все чудово!")).toBeVisible();
  await clientCtx.close();

  // 6. Власник бачить відповідь клієнта, коментар і запис в історії
  await page.reload();
  await expect(page.getByText("Клієнт прийняв етап")).toBeVisible();
  await expect(page.getByText("Дякую, все чудово!", { exact: true })).toBeVisible();
  const history = page.getByRole("heading", { name: "Історія" }).locator("..");
  await expect(history.getByText("прийняв(ла) етап")).toBeVisible();
  await expect(history.getByText("створив(ла) посилання для клієнта")).toBeVisible();
});

test("прострочене або вимкнене посилання не відкривається", async ({ page, browser }) => {
  await signUp(page, "Власник", uniqueEmail());
  await createClient(page, "Клієнт", "client@example.com");
  await createProject(page, { client: "Клієнт", title: "Проєкт", template: "Без шаблону" });

  await page.getByRole("button", { name: "Створити посилання" }).click();
  const portalUrl = await page.getByLabel("Посилання для клієнта").inputValue();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Вимкнути" }).click();
  await expect(page.getByRole("button", { name: "Створити посилання" })).toBeVisible();

  const ctx = await browser.newContext({ locale: "uk-UA" });
  const client = await ctx.newPage();
  await client.goto(portalUrl);
  await expect(client.getByRole("heading", { name: "Посилання застаріло" })).toBeVisible();
  await ctx.close();
});

test("налаштування: бренд зберігається", async ({ page }) => {
  await signUp(page, "Дизайнерка", uniqueEmail());
  await page.getByRole("link", { name: "Налаштування" }).click();
  await expect(page.getByRole("heading", { name: "Налаштування" })).toBeVisible();

  await page.getByLabel("Назва").fill("Студія Тест");
  await page.getByRole("button", { name: "Зберегти" }).first().click();
  await expect(page.getByText("Збережено")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Назва")).toHaveValue("Студія Тест");
});
