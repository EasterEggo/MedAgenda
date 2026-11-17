import {
  Activity,
  Baby,
  Bone,
  Brain,
  BrainCircuit,
  Droplet,
  Droplets,
  Ear,
  Eye,
  FlaskConical,
  HeartPulse,
  Magnet,
  Scan,
  ScanLine,
  Sparkles,
  Stethoscope,
  Venus,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { ServiceType } from "@medagenda/shared";

/** Icon per catalog slug. Unknown slugs fall back to a generic icon for the service type. */
const ICONS: Record<string, LucideIcon> = {
  "clinico-geral": Stethoscope,
  cardiologia: HeartPulse,
  dermatologia: Sparkles,
  ginecologia: Venus,
  ortopedia: Bone,
  pediatria: Baby,
  oftalmologia: Eye,
  psiquiatria: Brain,
  endocrinologia: Activity,
  neurologia: BrainCircuit,
  otorrinolaringologia: Ear,
  urologia: Droplet,
  hemograma: FlaskConical,
  "raio-x": ScanLine,
  ultrassom: Waves,
  "ressonancia-magnetica": Magnet,
  eletrocardiograma: HeartPulse,
  tomografia: Scan,
  "glicemia-jejum": Droplets,
  "perfil-lipidico": FlaskConical,
  espirometria: Wind,
  audiometria: Ear,
};

export function CatalogIcon({ slug, serviceType }: { slug: string; serviceType: ServiceType }) {
  const fallback = serviceType === "EXAM" ? FlaskConical : Stethoscope;
  const Icon = ICONS[slug] ?? fallback;
  return <Icon aria-hidden="true" className="size-8 text-primary" />;
}
