import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { PublicNav } from "@/components/layout/public-nav";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader actions={<PublicNav />} />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
