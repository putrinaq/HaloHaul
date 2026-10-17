import "react";

declare module "react" {
  interface CSSProperties {
    /** Stagger index for `.reveal`, `.line-mask[data-scroll]` and the hero intro (see globals.css). */
    "--d"?: number;
  }
}
