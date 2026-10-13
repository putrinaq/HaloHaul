"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safeNext";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string } | { kind: "sent"; email: string };

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "busy";

  const done = () => {
    router.push(next);
    router.refresh();
  };

  async function onMagicLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setStatus({ kind: "busy" });
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: next });
    setStatus(error ? { kind: "error", message: error.message ?? "Couldn't send the link." } : { kind: "sent", email });
  }

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setStatus({ kind: "busy" });
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (error) return setStatus({ kind: "error", message: error.message ?? "Couldn't sign you in." });
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      router.push(`/admin/two-factor?next=${encodeURIComponent(next)}`);
      return;
    }
    done();
  }

  async function onSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setStatus({ kind: "busy" });
    const { error } = await authClient.signUp.email({
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (error) return setStatus({ kind: "error", message: error.message ?? "Couldn't create your account." });
    done();
  }

  if (status.kind === "sent") {
    return (
      <div className="mt-6 space-y-3" role="status">
        <p>
          Check <strong>{status.email}</strong> for a sign-in link. It expires in 10 minutes.
        </p>
        <Button variant="outline" size="lg" className="w-full" onClick={() => setStatus({ kind: "idle" })}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <Tabs defaultValue="link" className="mt-6" onValueChange={() => setStatus({ kind: "idle" })}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="link">Email link</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="signup">New account</TabsTrigger>
      </TabsList>

      <TabsContent value="link">
        <form onSubmit={onMagicLink} className="mt-4 space-y-4">
          <Field id="ml-email" label="Email" name="email" type="email" autoComplete="email" />
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </Button>
          <p className="text-xs text-muted-foreground">No password needed. New here? This creates your account.</p>
        </form>
      </TabsContent>

      <TabsContent value="password">
        <form onSubmit={onPassword} className="mt-4 space-y-4">
          <Field id="pw-email" label="Email" name="email" type="email" autoComplete="email" />
          <Field id="pw-password" label="Password" name="password" type="password" autoComplete="current-password" />
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="signup">
        <form onSubmit={onSignUp} className="mt-4 space-y-4">
          <Field id="su-name" label="Name" name="name" autoComplete="name" />
          <Field id="su-email" label="Email" name="email" type="email" autoComplete="email" />
          <Field
            id="su-password"
            label="Password (at least 10 characters)"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
          />
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        </form>
      </TabsContent>

      {status.kind === "error" ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {status.message}
        </p>
      ) : null}
    </Tabs>
  );
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<"input">) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} required className="h-11" {...props} />
    </div>
  );
}
