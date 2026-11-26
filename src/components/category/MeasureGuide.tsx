"use client";

import { Info, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { MEASURE_ART } from "./measureArt";

/** Steps for each measurement in the library, beside its drawing. */
const STEPS: Readonly<Record<string, readonly string[]>> = {
  height_cm: [
    "Take your shoes off and stand straight with your back to a wall.",
    "Rest a book flat on your head and mark the wall under it.",
    "Measure from the floor to the mark.",
  ],
  chest_cm: [
    "Stand relaxed with your arms down.",
    "Wrap the tape around the fullest part of your chest, under your armpits.",
    "Keep it level and snug, not tight.",
  ],
  overbust_cm: [
    "Wear a bra without padding.",
    "Wrap the tape around the fullest part of your bust.",
    "Keep it level and loose enough to breathe.",
  ],
  underbust_cm: ["Wrap the tape around your ribcage, just under your bust.", "Keep it level and snug, and breathe out."],
  waist_cm: [
    "Find your natural waist: the narrowest part, above your belly button.",
    "Wrap the tape around it, level and snug.",
    "Breathe normally; don't pull your stomach in.",
  ],
  hip_cm: ["Stand with your feet together.", "Wrap the tape around the fullest part of your hips and bottom, keeping it level."],
  shoulder_cm: [
    "Find the edge of each shoulder, where a sleeve seam would sit.",
    "Measure straight across from one edge to the other.",
    "It's easier if someone measures across your back for you.",
  ],
  arm_length_cm: ["Let your arm hang with a slight bend.", "Measure from the edge of your shoulder down to your wrist bone."],
  body_length_cm: [
    "Start at the top of your shoulder, beside your neck.",
    "Measure straight down to where you want the top to end.",
  ],
  inseam_cm: ["Stand straight with your feet a little apart.", "Measure from the top of your inner thigh down to your ankle bone."],
  foot_length_cm: [
    "Stand on a sheet of paper with your heel against a wall.",
    "Mark the tip of your longest toe.",
    "Measure from the wall to the mark. Do both feet and use the longer one.",
  ],
  ring_inner_circumference_mm: [
    "Wrap a strip of paper around the base of your finger.",
    "Mark where the end overlaps.",
    "Lay it flat and measure up to the mark, in millimetres.",
  ],
  pd_mm: [
    "Look straight ahead into a mirror and hold a ruler under your eyes.",
    "Measure from the centre of one pupil to the centre of the other.",
    "It's also on most glasses prescriptions.",
  ],
};

export function hasMeasureGuide(key: string, imageUrl?: string): boolean {
  return key in MEASURE_ART || Boolean(imageUrl);
}

/** The "i" beside a measurement: opens a looping drawing of how to measure it, with steps. */
export function MeasureGuide({ fieldKey, label, imageUrl }: { fieldKey: string; label: string; imageUrl?: string }) {
  const Art = MEASURE_ART[fieldKey];
  const steps = STEPS[fieldKey];
  const name = label.toLowerCase();
  return (
    <Dialog.Root>
      <Dialog.Trigger
        aria-label={`How to measure ${name}`}
        className="tap-area grid size-5 shrink-0 place-items-center rounded-full text-white/55 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Info className="size-4" aria-hidden />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <Dialog.Content
          data-lenis-prevent
          className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl border border-white/10 bg-neutral-950 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-[0_-30px_80px_-20px_rgb(0_0_0/0.9)] outline-none duration-300 ease-(--ease-out-expo) data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom motion-reduce:animate-none sm:inset-0 sm:m-auto sm:h-fit sm:w-[26rem] sm:rounded-3xl sm:p-6 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95"
        >
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="display pt-1 text-2xl">How to measure {name}</Dialog.Title>
            <Dialog.Close className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
              <X className="size-5" aria-hidden />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          {Art ? (
            <div className="mx-auto mt-3 aspect-square w-full max-w-64 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
              <Art />
            </div>
          ) : null}
          {steps ? (
            <Dialog.Description asChild>
              <ol className="mt-5 space-y-3 text-sm text-white/80">
                {steps.map((s, i) => (
                  <li key={s} className="flex gap-3">
                    <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-medium text-white">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">A picture showing how to measure {name}.</Dialog.Description>
          )}
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived presigned R2 URL
            <img src={imageUrl} alt={`How to measure ${name}`} className="mt-5 max-h-72 w-full rounded-xl border border-white/10 object-contain" />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
