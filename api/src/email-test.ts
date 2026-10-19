import { sendEmail } from "./lib/miler.js";

const result = await sendEmail({
    to: "maksimlozinskiy12@gmail.com",
    subject: "StatusDEV: тестовий лист",
    html: "<p>test from <strong>StatusDEV</strong>.</p>",
    text: "StatusDEV test email.",
});

console.log("Надіслано, id:", result?.id);