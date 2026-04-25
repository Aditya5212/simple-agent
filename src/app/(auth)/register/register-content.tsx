"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";
import { AuthForm } from "@/components/chat/auth-form";
import { SubmitButton } from "@/components/chat/submit-button";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { type RegisterActionState, register } from "../actions";

function getSafeRedirectPath(value: string | null) {
  if (!value) return "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<RegisterActionState, FormData>(
    register,
    { status: "idle" }
  );

  const { update: updateSession } = useSession();
  const redirectTo = getSafeRedirectPath(searchParams.get("redirect"));
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const guestHref = `${basePath}/api/auth/guest?redirectUrl=${encodeURIComponent(redirectTo)}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: router/updateSession are stable refs
  useEffect(() => {
    if (state.status === "user_exists") {
      toast({ type: "warning", description: "Account already exists." });
    } else if (state.status === "failed") {
      toast({ type: "warning", description: "Unable to create account." });
    } else if (state.status === "invalid_data") {
      toast({ type: "warning", description: "Enter a valid email and password." });
    } else if (state.status === "success") {
      toast({ type: "success", description: "Account created!" });
      setIsSuccessful(true);
      updateSession();
      router.replace(redirectTo);
      router.refresh();
    }
  }, [state, redirectTo]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    formAction(formData);
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
      <p className="text-sm text-muted-foreground">Get started for free</p>
      <AuthForm action={handleSubmit} defaultEmail={email}>
        <SubmitButton isSuccessful={isSuccessful}>Sign up</SubmitButton>
        <Button asChild className="w-full" variant="secondary">
          <a href={guestHref}>Continue as guest</a>
        </Button>
        <p className="text-center text-[13px] text-muted-foreground">
          {"Have an account? "}
          <Link
            className="text-foreground underline-offset-4 hover:underline"
            href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
          >
            Sign in
          </Link>
        </p>
      </AuthForm>
    </>
  );
}
