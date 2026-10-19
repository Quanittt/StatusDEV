import type { ProjectTemplate } from "@statusdev/shared";

export interface TemplateMilestone {
  title: string;
  // Що має зробити клієнт на цьому етапі; показується в порталі.
  clientAction?: string;
}

export interface TemplateDefinition {
  label: string;
  milestones: TemplateMilestone[];
}

export const PROJECT_TEMPLATES: Record<ProjectTemplate, TemplateDefinition> = {
  website: {
    label: "Сайт",
    milestones: [
      { title: "Бриф і вимоги", clientAction: "Заповнити бриф і надіслати матеріали" },
      { title: "Прототип і дизайн", clientAction: "Переглянути й затвердити дизайн" },
      { title: "Верстка і розробка" },
      { title: "Тестування і правки", clientAction: "Перевірити сайт і залишити правки" },
      { title: "Запуск" },
    ],
  },
  landing: {
    label: "Лендинг",
    milestones: [
      { title: "Бриф і структура", clientAction: "Надіслати тексти, логотип і приклади сайтів, що подобаються" },
      { title: "Дизайн першого екрана", clientAction: "Затвердити першу концепцію" },
      { title: "Повний дизайн" },
      { title: "Верстка і форма заявок" },
      { title: "Тестування і правки", clientAction: "Перевірити сторінку на телефоні й комп'ютері" },
      { title: "Запуск і аналітика" },
    ],
  },
  mobile_app: {
    label: "Мобільний застосунок",
    milestones: [
      { title: "Вимоги й user stories", clientAction: "Підтвердити список функцій першої версії" },
      { title: "UX-прототип", clientAction: "Пройти прототип і затвердити сценарії" },
      { title: "UI-дизайн", clientAction: "Затвердити дизайн екранів" },
      { title: "Розробка MVP" },
      { title: "Бета-тестування", clientAction: "Протестувати збірку й надіслати зауваження" },
      { title: "Публікація в App Store / Google Play", clientAction: "Надати доступ до акаунтів розробника" },
    ],
  },
  branding: {
    label: "Брендинг",
    milestones: [
      { title: "Бриф і дослідження" },
      { title: "Концепції логотипу" },
      { title: "Розробка айдентики" },
      { title: "Брендбук" },
    ],
  },
  smm: {
    label: "SMM",
    milestones: [
      { title: "Аудит і стратегія" },
      { title: "Контент-план" },
      { title: "Налаштування профілів" },
      { title: "Запуск і публікації" },
      { title: "Звіт за місяць" },
    ],
  },
};
