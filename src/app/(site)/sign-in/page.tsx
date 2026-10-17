import { MapPin, ReceiptText, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

const PERKS = [
  { icon: MapPin, text: "Live tracking from the seller to campus pickup" },
  { icon: ReceiptText, text: "Every fee itemised before you pay" },
  { icon: ShieldCheck, text: "Nothing is bought without your approval" },
];

/**
 * Everything decorative here is static markup animated by CSS (transform and
 * opacity only), so the page ships no animation JavaScript; the form is the
 * only client component. All motion stops under prefers-reduced-motion.
 */
export default function SignInPage() {
  return (
    // overflow-x-clip: the card's glow mustn't cause sideways scrolling on
    // phones, while the backdrop can still reach up behind the header.
    <div className="relative isolate flex flex-1 items-center overflow-x-clip">
      <Backdrop />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-10 sm:py-14 lg:grid-cols-[1fr_27rem] lg:gap-20 lg:py-20">
        <section className="max-lg:text-center">
          <p className="eyebrow intro-fade" style={{ "--d": 0 }}>
            Welcome to HaloHaul
          </p>
          <h1 className="display mt-4 text-4xl leading-[1.04] sm:text-5xl lg:text-7xl">
            <span className="line-mask">
              <span className="intro-rise" style={{ "--d": 0 }}>
                Every haul,
              </span>
            </span>
            <span className="line-mask">
              <span className="intro-rise text-white/75 italic" style={{ "--d": 1 }}>
                one sign-in away.
              </span>
            </span>
          </h1>
          <p className="intro-fade mt-6 hidden max-w-md text-lg text-white/75 lg:block" style={{ "--d": 1 }}>
            Follow each order from the seller&apos;s warehouse to your hands, with nothing hidden along the way.
          </p>
          <ul className="mt-10 hidden space-y-4 lg:block">
            {PERKS.map(({ icon: Icon, text }, i) => (
              <li key={text} className="intro-fade flex items-center gap-4 text-white/85" style={{ "--d": 2 + i }}>
                <span className="glass grid size-10 shrink-0 place-items-center rounded-full">
                  <Icon className="size-4" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </section>

        <div className="signin-card-in relative mx-auto w-full max-w-md lg:max-w-none">
          {/* Soft glow behind the card. */}
          <div aria-hidden className="signin-glow absolute -inset-10 -z-10 rounded-full" />
          <div className="signin-card relative rounded-3xl p-6 sm:p-8">
            <CardSky />
            <div className="relative">
              <Suspense fallback={<div className="h-104" />}>
                <SignInForm />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Where each shooting star starts (as a fraction of the card), and its timing.
// Long, unequal cycles keep them occasional and out of step with each other.
const SHOOTING_STARS = [
  { x: "88%", y: "6%", duration: "9s", delay: "1.2s" },
  { x: "70%", y: "2%", duration: "13s", delay: "5.5s" },
  { x: "56%", y: "-2%", duration: "17s", delay: "10s" },
];

/**
 * A little night sky inside the sign-in card: two twinkling star layers and
 * a few shooting stars. Pure CSS (transform/opacity only), faded out towards
 * the form so the fields stay clean. Under reduced motion the stars are a
 * still image and the shooting stars are off.
 */
function CardSky() {
  return (
    <div aria-hidden className="signin-sky pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <div className="signin-sky-stars absolute inset-0" />
      <div className="signin-sky-stars signin-sky-stars-b absolute inset-0" />
      {SHOOTING_STARS.map((s) => (
        <span
          key={s.x + s.y}
          className="shooting-star"
          style={{ left: s.x, top: s.y, animationDuration: s.duration, animationDelay: s.delay }}
        />
      ))}
    </div>
  );
}

/** Night-river photo with a slow drift, rolling mist and twinkling stars. */
function Backdrop() {
  return (
    // Reaches up behind the site header (-top-40 > header height) so the glass
    // nav floats over the photo; clips its own motion so nothing scrolls sideways.
    <div aria-hidden className="absolute inset-x-0 -top-40 bottom-0 -z-10 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-optimised 65 KB static image */}
      <img
        src="/images/sign-in.webp"
        alt=""
        fetchPriority="high"
        decoding="async"
        className="signin-drift absolute inset-0 size-full object-cover"
      />
      <div className="signin-stars absolute inset-0" />
      <div className="signin-mist signin-mist-a absolute inset-y-0 left-0 w-[200%]" />
      <div className="signin-mist signin-mist-b absolute inset-y-0 left-0 w-[200%]" />
      {/* Legibility: darker towards the bottom, and behind the card on desktop. */}
      <div className="absolute inset-0 bg-linear-to-b from-black/55 via-black/25 to-black" />
      <div className="absolute inset-0 hidden bg-linear-to-l from-black/70 via-black/20 to-transparent lg:block" />
    </div>
  );
}
