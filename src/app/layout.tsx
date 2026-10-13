import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { cn } from "@/lib/utils";
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
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-MY" className={cn("h-full antialiased", sans.variable, serif.variable)}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
