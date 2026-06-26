import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  bordered?: boolean;
  padded?: boolean;
}

export const Section = React.forwardRef<HTMLElement, SectionProps>(function Section(
  { title, description, actions, bordered = true, padded = true, className, children, ...rest },
  ref,
) {
  return (
    <section
      ref={ref}
      className={cn(
        "rounded-2xl bg-card text-card-foreground",
        bordered && "border border-border-subtle shadow-xs",
        className,
      )}
      {...rest}
    >
      {(title || actions || description) && (
        <header
          className={cn(
            "flex flex-col gap-1 border-b border-border-subtle/60 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
            padded ? "px-5 py-4" : "px-4 py-3",
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(padded ? "p-5" : "p-0")}>{children}</div>
    </section>
  );
});

export const Panel = Section;
