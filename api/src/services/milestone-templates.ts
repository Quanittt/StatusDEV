import type { ProjectTemplate } from "@statusdev/shared";

export const MILESTONE_TEMPLATES: Record<ProjectTemplate, string[]> = {
  website: [
    "Бриф і вимоги",
    "Прототип і дизайн",
    "Верстка і розробка",
    "Тестування і правки",
    "Запуск",
  ],
  branding: [
    "Бриф і дослідження",
    "Концепції логотипу",
    "Розробка айдентики",
    "Брендбук",
  ],
  smm: [
    "Аудит і стратегія",
    "Контент-план",
    "Налаштування профілів",
    "Запуск і публікації",
    "Звіт за місяць",
  ],
};
