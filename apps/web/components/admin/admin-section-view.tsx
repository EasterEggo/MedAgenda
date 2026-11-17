"use client";

import { EntityAdmin } from "./entity-admin";
import type { AdminSection } from "@/lib/admin/sections";
import { SlotsAdmin } from "./slots-admin";

export function AdminSectionView({ section }: { section: AdminSection }) {
  return section === "slots" ? <SlotsAdmin /> : <EntityAdmin entity={section} />;
}
