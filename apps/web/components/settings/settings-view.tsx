"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/components/auth/use-me";
import { DataSection } from "./data-section";
import { FeedSection } from "./feed-section";
import { LanguageSection } from "./language-section";
import { ProfileSection } from "./profile-section";
import { SessionsSection } from "./sessions-section";

export function SettingsView() {
  const t = useTranslations("settings");
  const { data: me } = useMe();
  if (!me) return null;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <ProfileSection me={me} />
      <LanguageSection />
      <SessionsSection />
      <FeedSection />
      <DataSection />
    </div>
  );
}
