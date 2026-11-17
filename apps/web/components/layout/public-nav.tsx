import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";

export async function PublicNav() {
  const t = await getTranslations("common.nav");
  return (
    <>
      <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
        {t("login")}
      </Link>
      <Link href="/register" className={buttonVariants()}>
        {t("register")}
      </Link>
    </>
  );
}
