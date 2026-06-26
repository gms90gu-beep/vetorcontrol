import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  sticky?: boolean;
}

/**
 * Standard page header used across all modules.
 * Mobile: grid (text shrinks, actions fixed). Desktop: flex with actions on the right.
 */
export const PageHeader = React.memo(function PageHeader({
  title,
  description,
  icon,
  actions,
  breadcrumb,
  sticky,
  className,
  ...rest
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "w-full border-b border-border-subtle bg-background/80 backdrop-blur",
        sticky && "sticky top-0 z-[var(--z-sticky)]",
        className,
      )}
      {...rest}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-4 sm:px-6 lg:px-8">
        {breadcrumb && <div className="text-xs text-muted-foreground">{breadcrumb}</div>}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              <div
                aria-hidden
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {title}
              </h1>
              {description && (
                <p className="truncate text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      </div>
    </header>
  );
});
