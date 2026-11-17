import * as React from "react";
import { cn } from "@/lib/utils";

/** Native select styled like Input. Native controls keep keyboard and screen reader behaviour. */
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "block min-h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-base text-foreground aria-[invalid=true]:border-danger disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
