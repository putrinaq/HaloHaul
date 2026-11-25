import type { Metadata } from "next";
import { Suspense } from "react";
import { Panel } from "@/components/admin/ui";
import { requireAdmin } from "@/server/session";
import { whatsappConfig } from "@/server/whatsapp/client";
import { evolutionConfig, linkState } from "@/server/whatsapp/evolution";
import { LinkPanel } from "./LinkPanel";

export const metadata: Metadata = { title: "WhatsApp" };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white/5" />}>
      <Load />
    </Suspense>
  );
}

async function Load() {
  await requireAdmin();
  const evo = evolutionConfig();
  if (evo) {
    return (
      <div className="max-w-2xl space-y-4">
        <LinkPanel initial={await linkState(evo)} />
        {/* Evolution API's licence asks for this notice where admins can see it. */}
        <p className="text-xs text-white/50">
          This system uses{" "}
          <a href="https://github.com/evolution-foundation/evolution-api" target="_blank" rel="noopener noreferrer" className="link-underline">
            Evolution API
          </a>{" "}
          to connect to WhatsApp.
        </p>
      </div>
    );
  }
  return (
    <Panel title="WhatsApp" className="max-w-2xl">
      <p className="text-white/70">
        {whatsappConfig()
          ? "Connected through Meta's official API."
          : "Not set up on the server yet. Messages opens WhatsApp instead. The steps are in docs/WHATSAPP.md."}
      </p>
    </Panel>
  );
}
