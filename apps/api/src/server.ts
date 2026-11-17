import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createSmtpMailer } from "./lib/mailer.js";
import { createPrisma } from "./lib/prisma.js";

const config = loadConfig();
const prisma = createPrisma(config.DATABASE_URL);
const mailer = createSmtpMailer({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  from: config.SMTP_FROM,
});
const app = await buildApp({ config, prisma, mailer });
app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (err) {
  app.log.error({ err }, "failed to start API");
  process.exit(1);
}
