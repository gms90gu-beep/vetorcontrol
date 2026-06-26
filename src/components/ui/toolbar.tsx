import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  sticky?: boolean;
}

export const Toolbar = React.forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar(
  { sticky, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      role="toolbar"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle bg-card/70 px-3 py-2 backdrop-blur",
        sticky && "sticky top-0 z-[var(--z-sticky)]",
        className,
      )}
      {...rest}
    />
  );
});

export const ActionBar = Toolbar;
