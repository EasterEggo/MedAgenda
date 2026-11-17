import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("common");
  return (
    <footer className="border-t border-slate-300 bg-card">
      <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-6 text-sm text-muted">
        <p>{t("footer.privacy")}</p>
        <p>
          &copy; {new Date().getFullYear()} {t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}
