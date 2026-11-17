import type { FastifyInstance } from "fastify";
import { parse } from "../../lib/validate.js";
import {
  ClinicsQuerySchema,
  PaginationSchema,
  ProvidersQuerySchema,
  SlotsQuerySchema,
} from "./schema.js";
import { createCatalogService } from "./service.js";

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  const service = createCatalogService(app.prisma);

  app.get("/catalog/specialties", async (r) =>
    service.specialties(parse(PaginationSchema, r.query)),
  );
  app.get("/catalog/exams", async (r) => service.exams(parse(PaginationSchema, r.query)));
  app.get("/catalog/clinics", async (r) => service.clinics(parse(ClinicsQuerySchema, r.query)));
  app.get("/catalog/providers", async (r) =>
    service.providers(parse(ProvidersQuerySchema, r.query)),
  );
  app.get("/slots", async (r) => service.slots(parse(SlotsQuerySchema, r.query)));
}
