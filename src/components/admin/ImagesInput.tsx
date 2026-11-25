"use client";

import { ImagePlus, X } from "lucide-react";
import { useId, useState } from "react";
import { uploadImage } from "@/lib/uploadImage";

export interface UploadedImage {
  key: string;
  /** Thumbnail URL for the preview (short-lived). */
  url: string;
}

type Purpose = "help" | "sourcing" | "qc" | "product" | "store";

/**
 * Admin image picker: uploads straight to storage (re-encoded to WebP with a
 * thumbnail on the server) and keeps the resulting keys.
 */
export function ImagesInput({
  value,
  onChange,
  purpose,
  max = 6,
  label = "Add photo",
}: {
  value: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  purpose: Purpose;
  max?: number;
  label?: string;
}) {
  const id = useId();
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = Math.max(0, max - value.length);
    const picked = [...files].slice(0, room);
    setBusy(picked.length);
    // In parallel; the images keep the order they were picked in.
    const results = await Promise.allSettled(
      picked.map((file) => uploadImage(file, "/api/admin/uploads", { purpose }).finally(() => setBusy((n) => n - 1))),
    );
    const done: UploadedImage[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") done.push({ key: r.value.key, url: r.value.previewUrl });
      else setError((r.reason as Error).message);
    }
    if (done.length) onChange([...value, ...done]);
  }

  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {value.map((img) => (
          <li key={img.key} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URL */}
            <img src={img.url} alt="" className="size-20 rounded-xl border border-white/10 object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v.key !== img.key))}
              aria-label="Remove photo"
              className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full border border-white/20 bg-neutral-900 text-white/80 hover:text-white"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
        {Array.from({ length: busy }, (_, i) => (
          <li key={`busy-${i}`} className="size-20 animate-pulse rounded-xl bg-white/10" aria-label="Uploading" />
        ))}
        {value.length + busy < max ? (
          <li>
            <label
              htmlFor={id}
              className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/25 text-xs text-white/60 transition-colors hover:border-white/50 hover:text-white"
            >
              <ImagePlus className="size-5" aria-hidden />
              {label}
            </label>
            <input
              id={id}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple={max > 1}
              className="sr-only"
              onChange={(e) => {
                void add(e.target.files);
                e.target.value = "";
              }}
            />
          </li>
        ) : null}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
