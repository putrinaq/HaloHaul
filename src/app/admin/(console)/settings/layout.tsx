import { Suspense } from "react";
import { SettingsNav } from "./SettingsNav";

export default function SettingsLayout({ children }: LayoutProps<"/admin/settings">) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="display text-5xl sm:text-6xl">Settings</h1>
      <Suspense fallback={<div className="mt-6 h-9" />}>
        <SettingsNav />
      </Suspense>
      <div className="mt-8">{children}</div>
    </div>
  );
}
