import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Bare, centred card for the admin's two-factor screens (no console chrome yet). */
export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex flex-1 flex-col items-center justify-center overflow-x-clip px-4 py-10">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(60%_60%_at_50%_0%,rgb(37_99_235/0.22),transparent)]" />
      <Logo suffix="ADMIN" className="mb-8" />
      <div className="signin-card-in w-full max-w-md rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_30px_80px_-24px_rgb(0_0_0/0.75)] sm:p-8">
        {children}
      </div>
    </div>
  );
}
