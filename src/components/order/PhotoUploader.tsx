"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { uploadImage } from "@/lib/uploadImage";
import { cn } from "@/lib/utils";

/**
 * Uploads straight to R2 via presigned URLs, then the server re-encodes the
 * image (stripping EXIF/GPS). `value` holds the final storage keys.
 */
export function PhotoUploader({
  value,
  onChange,
  max,
  enabled,
  invalid,
  describedBy,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  max: number;
  enabled: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) {
    return (
      <p className="rounded-lg border border-dashed border-white/20 p-4 text-sm text-muted-foreground">
        Photo uploads aren&apos;t available right now — describe the item in the remarks instead, or paste a link.
      </p>
    );
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const room = max - value.length;
    const chosen = Array.from(files).slice(0, room);
    if (files.length > room) setError(`Up to ${max} photos.`);
    setBusy((n) => n + chosen.length);
    // In parallel; the photos keep the order they were picked in.
    const results = await Promise.allSettled(
      chosen.map((file) => uploadImage(file, "/api/uploads").finally(() => setBusy((n) => n - 1))),
    );
    const added: string[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        added.push(r.value.key);
        setPreviews((p) => ({ ...p, [r.value.key]: r.value.previewUrl }));
      } else {
        setError(r.reason instanceof Error ? r.reason.message : "Upload failed");
      }
    }
    if (added.length) onChange([...value, ...added]);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {value.map((key) => (
          <div key={key} className="relative size-24 overflow-hidden rounded-lg bg-muted">
            {previews[key] ? (
              // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL
              <img src={previews[key]} alt="Uploaded photo" className="size-full object-cover" />
            ) : null}
            <button
              type="button"
              onClick={() => onChange(value.filter((k) => k !== key))}
              aria-label="Remove photo"
              className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/70"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {Array.from({ length: busy }).map((_, i) => (
          <div key={`busy-${i}`} className="grid size-24 place-items-center rounded-lg bg-muted">
            <Loader2 className="size-5 animate-spin" aria-label="Uploading" />
          </div>
        ))}
        {value.length + busy < max ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            aria-describedby={describedBy}
            className={cn(
              "grid size-24 place-items-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-white/5",
              invalid ? "border-destructive" : "border-white/30",
            )}
          >
            <span className="flex flex-col items-center gap-1 text-xs">
              <ImagePlus className="size-5" /> Add photo
            </span>
          </button>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 10 MB each. Location data is removed.</p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
