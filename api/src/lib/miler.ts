import { Resend } from "resend";
import { env } from "../env.js";

const resend = new Resend(env.RESEND_API_KEY);

export interface SendEmailParams {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
}

export async function sendEmail({ to, subject, html, text, replyTo }: SendEmailParams) {
    const { data, error } = await resend.emails.send({
        from: env.EMAIL_FROM,
        to,
        subject,
        html,
        text,
        replyTo,
    });

    if (error) {
        throw new Error(`Не вдалося надіслати лист: ${error.message}`);
    }

    return data; 
}