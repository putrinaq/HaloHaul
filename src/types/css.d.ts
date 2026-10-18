import "react";

declare module "react" {
  interface CSSProperties {
    /** Stagger index for `.reveal`, `.line-mask[data-scroll]` and the hero intro (see globals.css). */
    "--d"?: number;
    /** How long the admin "Tap again to confirm" bar takes to drain, e.g. "4000ms". */
    "--confirm-ms"?: string;
  }
}
