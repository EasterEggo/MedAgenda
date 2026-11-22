import nodemailer from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export function createSmtpMailer(opts: {
  host: string;
  port: number;
  from: string;
  /** Production: require STARTTLS so tokens and appointment data never travel in clear text. */
  requireTls?: boolean;
}): Mailer {
  const transport = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: false,
    // Dev: Mailpit has no TLS. Production: refuse to send unless the connection upgrades to TLS.
    ...(opts.requireTls ? { requireTLS: true } : { ignoreTLS: true }),
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
