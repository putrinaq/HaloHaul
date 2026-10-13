import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="relative isolate flex flex-1 items-center justify-center px-4 py-16">
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-optimised static image */}
      <img src="/images/sign-in.webp" alt="" className="absolute inset-0 -z-20 size-full object-cover opacity-60" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/60 to-black" />
      <div className="w-full max-w-md rounded-3xl border border-white/15 bg-black/60 p-6 backdrop-blur-xl sm:p-8">
        <h1 className="display text-4xl">Welcome to HaloHaul</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to place and track your orders.</p>
        <Suspense fallback={<div className="mt-6 h-64" />}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  );
}
