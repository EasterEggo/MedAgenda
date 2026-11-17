import nodemailer from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export function createSmtpMailer(opts: { host: string; port: number; from: string }): Mailer {
  const transport = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: false,
    ignoreTLS: true, // dev: Mailpit. Configure TLS here for a real SMTP provider.
  });
  return {
    async send(message) {
      await transport.sendMail({ from: opts.from, ...message });
    },
  };
}

/** In-memory mailer for tests. */
export function createMemoryMailer(): Mailer & { outbox: MailMessage[] } {
  const outbox: MailMessage[] = [];
  return {
    outbox,
    send(message) {
      outbox.push(message);
      return Promise.resolve();
    },
  };
}
