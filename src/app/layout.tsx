import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { Cursor } from "@/components/motion/Cursor";
import { Scrollbar } from "@/components/motion/Scrollbar";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { MobileTabBar } from "@/components/site/MobileTabBar";
import { cn } from "@/lib/utils";
import { Suspense } from "react";
import "locomotive-scroll/locomotive-scroll.css";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: { default: "HaloHaul — your personal buyer across China's platforms", template: "%s · HaloHaul" },
  description:
    "Send a link or a photo. We verify the seller, buy it, consolidate shipping and hand it over on campus — every fee shown before you pay.",
  applicationName: "HaloHaul",
  // Added to a home screen, it opens full-screen like an app.
  appleWebApp: { capable: true, title: "HaloHaul", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  // Lets the page run under the notch / home indicator; layout pads with
  // env(safe-area-inset-*) where it matters (header, tab bar, sticky bars).
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-MY" className={cn("h-full antialiased", sans.variable, serif.variable)}>
      <body className="flex min-h-full flex-col">
        <SmoothScroll />
        {children}
        <Suspense fallback={null}>
          <MobileTabBar />
        </Suspense>
        <Scrollbar />
        <Cursor />
      </body>
    </html>
  );
}
