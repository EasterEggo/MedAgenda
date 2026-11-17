import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/** Titled settings block. The heading id labels the region for screen readers. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <section aria-labelledby={`${id}-title`} data-testid={`settings-${id}`} className="contents">
        <div>
          <h2 id={`${id}-title`} className="text-xl font-bold">
            {title}
          </h2>
          {description ? <p className="text-muted">{description}</p> : null}
        </div>
        {children}
      </section>
    </Card>
  );
}
