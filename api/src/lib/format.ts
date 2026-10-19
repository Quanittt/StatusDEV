const dateFmt = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// Дати етапів зберігаються як північ UTC, тому й показуємо їх у UTC: день не зсувається.
export const formatDateUk = (d: Date) => dateFmt.format(d);
