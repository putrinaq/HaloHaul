"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Photo {
  key: string;
  preview: string;
}

async function uploadOne(file: File): Promise<Photo> {
  const presign = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });
  const p = await presign.json();
  if (!presign.ok) throw new Error(p.error ?? "Upload failed");

  const put = await fetch(p.url, { method: "PUT", headers: p.headers, body: file });
  if (!put.ok) throw new Error("Upload failed. Check your connection and try again.");

  const fin = await fetch("/api/uploads/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: p.key }),
  });
  const f = await fin.json();
  if (!fin.ok) throw new Error(f.error ?? "Upload failed");
  return { key: f.key, preview: f.previewUrl };
}

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
    const added: string[] = [];
    for (const file of chosen) {
      try {
        const photo = await uploadOne(file);
        added.push(photo.key);
        setPreviews((p) => ({ ...p, [photo.key]: photo.preview }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy((n) => n - 1);
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
