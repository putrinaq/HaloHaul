import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Small building blocks shared by every admin screen. Server-safe (no hooks).

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="display text-5xl sm:text-6xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-white/55">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("admin-card p-5 text-sm", className)}>
      {title || actions ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <h2 className="font-medium">{title}</h2> : <span />}
          {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-white/85">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-white/50">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const TONES = {
  neutral: "bg-white/10 text-white/85",
  info: "bg-sky-500/15 text-sky-300",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-white/5 text-white/70">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-4 font-medium">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-sm text-white/55">{body}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "warning" | "danger";
}) {
  const body = (
    <>
      <p className="text-sm text-white/55">{label}</p>
      <p className={cn("mt-1 text-3xl font-medium tabular-nums", tone === "warning" && "text-warning", tone === "danger" && "text-destructive")}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/50">{hint}</p> : null}
    </>
  );
  const cls = "admin-card block p-4 transition-colors";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-white/25")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Previous / next pager for 25-per-page lists. `href(page)` builds the link (keeping filters). */
export function Pagination({ page, pageCount, href }: { page: number; pageCount: number; href: (page: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className="admin-btn-secondary" rel="prev">
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-white/55 tabular-nums">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className="admin-btn-secondary" rel="next">
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** A definition list row pair, for detail panels. */
export function Rows({ rows }: { rows: Array<[ReactNode, ReactNode] | null | false> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
      {rows.filter(Boolean).map((r, i) => {
        const [k, v] = r as [ReactNode, ReactNode];
        return (
          <div key={i} className="contents">
            <dt className="text-white/55">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        );
      })}
    </dl>
  );
}
