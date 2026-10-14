# Структура Figma-файлу: що взято з «Потік Монет»

Джерело: `Потік Монет.fig` (розібрано `design/tools/fig-to-json.py`, 1769 вузлів, 10 сторінок). Нижче те, що там є, і як це перенесено в StatusDEV.

## Сторінки (однаковий порядок у StatusDEV)

| Сторінка | Що в «Потік Монет» | У StatusDEV |
|---|---|---|
| `00_Cover` | Обкладинка 1440×921, темно-синій фон | Обкладинка на темно-коричневому |
| `01_User_Flow` | 3 сценарії + легенда | Сценарії: вхід, перший проєкт, зміна статусу етапу |
| `02_Sitemap` | Карта сторінок | `/login`, `/signup`, `/`, `/projects/new`, `/projects/:id`, `/clients` |
| `03_Wireframes` | Каркас 1440 | Каркаси перед екранами |
| `04_Design_System` | Палітра, типографіка, UI Kit (атоми → молекули → організми) | Те саме, будує плагін |
| `05_Desktop` | Homepage 1440 | 4 екрани кабінету, будує плагін |
| `06_Mobile` | Homepage 390 | Портал клієнта 375 (ще не зроблено, див. HANDOFF-design.md) |
| `07_Prototype` | Прототип, модалка, мобільне меню | Пізніше |
| `08_UX_Audit` | Чеклісти, «Plugin report», «Component audit», ШІ-аудит | Звіт плагіна «Аудит» |
| `Internal Only Canvas` | Зразки `Brand/*`, `Type/*`, змінні | Те саме |

## Правила, які діють у файлі

- **Змінні в трьох колекціях:** `Colors` (`color/primary` …), `Spacing` (`space/4 … 96`), `Radius` (`radius/xs, sm, md, pill`).
- **Стилі:** кольори `Brand/<токен>`, текст `Type/Display, H1, H2, H3, Body, Small, Caption, Button, Logo`, тінь `Shadow/Soft`.
- **Іменування компонентів:** `Група/Назва`, варіанти через властивість: `State=Default|Hover|Active|Focus|Disabled`, `Status=Success|Warning|Error`, `Device=Desktop|Mobile`.
- **UI Kit** розкладений на «Атоми», «Молекули», «Організми», «Картки».
- **Шрифти:** Montserrat (заголовки) + Inter (текст). У StatusDEV лишено лише Inter у Figma, а в коді системний шрифт.
- **Кольори станів** (ті самі пари, що в HANDOFF-design.md): `#DBEAFE/#1D4ED8`, `#DCFCE7/#15803D`, `#FEF3C7/#92400E`.

## Плагін `design/figma-plugin`

Імпорт: Figma Desktop → Plugins → Development → Import plugin from manifest → `design/figma-plugin/manifest.json`.
Запускати по черзі (кожна команда безпечна для повторного запуску; команди 5–8 перебудовують свою сторінку заново):

1. **Структура сторінок і токени** — 10 сторінок, змінні Colors/Spacing/Radius, стилі Brand/*, Type/*, Shadow/Soft, обкладинка, зразки.
2. **Компоненти (UI Kit)** — Button/Primary·Secondary·Outline·Destructive (5 станів), Form field, Badge/Project, Pill/Milestone, Progress, Client action, Header; усе прив'язане до змінних, з описами.
3. **Екрани (Desktop)** — Auth, Projects, Project, Clients з екземплярів компонентів (`05_Desktop`).
4. **Аудит контрасту і токенів** — перевіряє текст на поточній сторінці за WCAG AA і рахує заливки без змінних; звіт кладе на `08_UX_Audit`.
5. **User Flow** (`01_User_Flow`) — 3 сценарії: реєстрація і перший проєкт, ведення проєкту, портал клієнта на телефоні; основний шлях + гілки й помилки, легенда типів кроків.
6. **Sitemap** (`02_Sitemap`) — дерево з трьох груп (публічні, кабінет, службові), готові сторінки й заплановані (портал, налаштування, тариф) різними кольорами.
7. **Wireframes** (`03_Wireframes`) — сірі каркаси 1440×900: список проєктів, проєкт, клієнти, вхід.
8. **Mobile** (`06_Mobile`) — портал клієнта 375 px: проєкт, порожній стан, недійсне посилання, а також кабінет на телефоні. Зони натискання 48 px, основний текст 16 px.
9. **Виправити 04_Design_System** — прив'язує голі кольори, відступи й радіуси до змінних, додає описи компонентів, розширює UI Kit під шапку 1280, додає фрейми «Brand — палітра кольорів» і «Типографіка», прибирає порожні фрейми.

Токени в `code.js` (`TOKENS`) дзеркалять `web/src/index.css`: змінюєте кольори в одному місці — оновіть і в другому.

## Скрипти аналізу `.fig`

```bash
tar -xf "Потік Монет.fig" -C tmp            # .fig — це zip
python -I design/tools/fig-to-json.py tmp/canvas.fig tmp/canvas.json
python -I design/tools/fig-summary.py tmp/canvas.json   # сторінки, кольори, шрифти, компоненти
```
