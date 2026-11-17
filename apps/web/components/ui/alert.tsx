import * as React from "react";
import { cn } from "@/lib/utils";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "error" | "success" | "info";
}

const styles = {
  error: "border-danger bg-danger-bg text-danger",
  success: "border-success bg-success-bg text-success",
  info: "border-slate-400 bg-slate-100 text-foreground",
};

export function Alert({ className, variant = "info", ...props }: AlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("rounded-md border px-4 py-3 text-sm font-medium", styles[variant], className)}
      {...props}
    />
  );
}
