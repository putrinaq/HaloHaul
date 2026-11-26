// Looping "how to measure" drawings, one per measurement in the library. Plain
// SVG animated by CSS (globals.css, `.ma-*`): a tape draws on, its ends tick in,
// then it fades and starts again. With reduced motion it's a still picture.

import type { ReactNode } from "react";

/** A filled mannequin, front view. The group's opacity keeps overlaps flat. */
function Figure() {
  return (
    <g fill="white" stroke="white" opacity="0.16">
      <circle cx="120" cy="30" r="13" stroke="none" />
      <rect x="114" y="40" width="12" height="14" stroke="none" />
      <path
        stroke="none"
        d="M96 56C108 52 132 52 144 56C148 58 150 62 148 70L143 98C140 108 139 114 140 120C145 128 147 138 147 150C147 156 128 158 120 162C112 158 93 156 93 150C93 138 95 128 100 120C101 114 100 108 97 98L92 70C90 62 92 58 96 56Z"
      />
      <g fill="none" strokeLinecap="round">
        <path d="M91 64L76 140M149 64L164 140" strokeWidth="11" />
        <path d="M107 152L104 222M133 152L136 222" strokeWidth="16" />
      </g>
    </g>
  );
}

/** The tape around the body at height `y`: the back half faint and dashed, the front drawn on. */
function Around({ y, rx, ry = 7 }: { y: number; rx: number; ry?: number }) {
  const l = 120 - rx;
  const r = 120 + rx;
  return (
    <>
      <path className="ma-fade" d={`M${l} ${y}A${rx} ${ry} 0 0 1 ${r} ${y}`} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 4" />
      <path className="ma-draw" pathLength={1} d={`M${l} ${y}A${rx} ${ry} 0 0 0 ${r} ${y}`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

/** A straight tape from one point to another, with a tick at each end. */
function Tape({ from, to, late = false }: { from: [number, number]; to: [number, number]; late?: boolean }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const len = Math.hypot(x2 - x1, y2 - y1);
  // Unit vector across the tape, for the end ticks.
  const nx = (-(y2 - y1) / len) * 6;
  const ny = ((x2 - x1) / len) * 6;
  const tick = (x: number, y: number) => `M${x - nx} ${y - ny}L${x + nx} ${y + ny}`;
  return (
    <g stroke="currentColor" strokeLinecap="round" fill="none">
      <path className={late ? "ma-draw-late" : "ma-draw"} pathLength={1} d={`M${x1} ${y1}L${x2} ${y2}`} strokeWidth="3" />
      <path className={late ? "ma-pop-late" : "ma-pop"} d={`${tick(x1, y1)}${tick(x2, y2)}`} strokeWidth="2" />
    </g>
  );
}

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 240 240" role="img" aria-label={label} className="measure-art size-full text-brand">
      {children}
    </svg>
  );
}

const body = (label: string, tape: ReactNode) => (
  <Frame label={label}>
    <Figure />
    {tape}
  </Frame>
);

/** A ruler's tick marks along a line (static, faint). */
function Ticks({ x1, x2, y, every = 8 }: { x1: number; x2: number; y: number; every?: number }) {
  const d: string[] = [];
  for (let x = x1, i = 0; x <= x2; x += every, i++) d.push(`M${x} ${y}L${x} ${y + (i % 5 === 0 ? 10 : 5)}`);
  return <path d={d.join("")} stroke="white" strokeOpacity="0.3" strokeWidth="1" />;
}

export const MEASURE_ART: Readonly<Record<string, () => ReactNode>> = {
  height_cm: () => (
    <Frame label="Measuring height from the floor to the top of the head">
      <path d="M40 231H210" stroke="white" strokeOpacity="0.3" strokeWidth="2" />
      <Figure />
      <path className="ma-pop" d="M104 17H196" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
      <Tape from={[188, 231]} to={[188, 17]} />
    </Frame>
  ),
  chest_cm: () => body("Tape around the fullest part of the chest", <Around y={84} rx={31} />),
  overbust_cm: () => body("Tape around the fullest part of the bust", <Around y={82} rx={31} />),
  underbust_cm: () => body("Tape around the ribcage, just under the bust", <Around y={100} rx={27} />),
  waist_cm: () => body("Tape around the narrowest part of the waist", <Around y={118} rx={24} />),
  hip_cm: () => body("Tape around the fullest part of the hips", <Around y={140} rx={31} />),
  shoulder_cm: () => body("Tape from one shoulder edge to the other", <Tape from={[93, 47]} to={[147, 47]} />),
  arm_length_cm: () => body("Tape from the shoulder point down to the wrist", <Tape from={[159, 58]} to={[174, 138]} />),
  body_length_cm: () => body("Tape from the top of the shoulder down to the hem", <Tape from={[130, 54]} to={[130, 150]} />),
  inseam_cm: () => body("Tape from the top of the inner thigh down to the ankle", <Tape from={[120, 156]} to={[120, 226]} />),

  foot_length_cm: () => (
    <Frame label="Foot on paper with the heel against a wall, measured to the longest toe">
      <rect x="44" y="56" width="168" height="128" rx="4" fill="white" fillOpacity="0.06" />
      <path d="M44 40V200" stroke="white" strokeOpacity="0.45" strokeWidth="6" strokeLinecap="round" />
      <g fill="white" opacity="0.16">
        <path d="M50 118C50 100 64 94 86 96C112 98 140 92 166 90C178 89 184 94 184 104C184 120 172 136 156 140C132 146 108 146 86 146C64 146 50 136 50 118Z" />
        <circle cx="192" cy="99" r="8" />
        <circle cx="187" cy="117" r="5.5" />
        <circle cx="181" cy="129" r="5" />
        <circle cx="173" cy="139" r="4.5" />
        <circle cx="163" cy="146" r="4" />
      </g>
      <path className="ma-pop" d="M201 92V116" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <Tape from={[47, 164]} to={[201, 164]} late />
    </Frame>
  ),

  ring_inner_circumference_mm: () => (
    <Frame label="A paper strip wrapped around the finger, then laid along a ruler">
      <path d="M20 78H136C158 78 170 90 170 100C170 110 158 122 136 122H20Z" fill="white" opacity="0.16" />
      <path d="M146 84C160 86 164 94 164 100C164 106 160 114 146 116" fill="none" stroke="white" strokeOpacity="0.3" strokeWidth="2" />
      <path className="ma-fade" d="M100 78A8 22 0 0 1 100 122" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 4" />
      <path className="ma-draw" pathLength={1} d="M100 78A8 22 0 0 0 100 122" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M40 176H200" stroke="white" strokeOpacity="0.3" strokeWidth="2" />
      <Ticks x1={40} x2={200} y={176} />
      <Tape from={[48, 166]} to={[168, 166]} late />
    </Frame>
  ),

  pd_mm: () => (
    <Frame label="Measuring from the centre of one pupil to the other">
      <g fill="white" opacity="0.16">
        <ellipse cx="120" cy="118" rx="74" ry="92" />
      </g>
      <g fill="none" stroke="white" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round">
        <path d="M74 92Q92 82 108 90M132 90Q148 82 166 92" />
        <path d="M120 112V146Q120 152 112 152" />
        <path d="M100 176Q120 186 140 176" />
        <ellipse cx="94" cy="110" rx="15" ry="9" />
        <ellipse cx="146" cy="110" rx="15" ry="9" />
      </g>
      <circle cx="94" cy="110" r="5" fill="white" fillOpacity="0.7" />
      <circle cx="146" cy="110" r="5" fill="white" fillOpacity="0.7" />
      <Tape from={[94, 110]} to={[146, 110]} />
    </Frame>
  ),
};
