"use client";

import { useState, useTransition, type FormEvent } from "react";
import { FieldError } from "@/components/form/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction } from "./actions";

export function ProfileForm({ initial }: { initial: { displayName: string; phone: string; campus: string } }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof updateProfileAction>> | null>(null);
  const fe = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    start(async () => setResult(await updateProfileAction(data)));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="displayName">Name</Label>
          <Input id="displayName" name="displayName" defaultValue={initial.displayName} className="h-11" autoComplete="name" />
          <FieldError message={fe.displayName} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">WhatsApp number</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={initial.phone} placeholder="012-345 6789" className="h-11" autoComplete="tel" />
          <FieldError message={fe.phone} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="campus">Campus</Label>
          <Input id="campus" name="campus" defaultValue={initial.campus} className="h-11" />
          <FieldError message={fe.campus} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </Button>
        {result?.ok ? <span className="text-sm text-success" role="status">Saved</span> : null}
        {result && !result.ok ? <span className="text-sm text-destructive" role="alert">{result.error}</span> : null}
      </div>
    </form>
  );
}
