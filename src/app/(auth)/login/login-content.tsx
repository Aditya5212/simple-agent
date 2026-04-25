"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/chat/auth-form";
import { SubmitButton } from "@/components/chat/submit-button";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { type LoginActionState, login } from "../actions";

function getSafeRedirectPath(value: string | null) {
  if (!value) return "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    { status: "idle" }
  );

  const { update: updateSession } = useSession();
  const redirectTo = getSafeRedirectPath(searchParams.get("redirect"));
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const guestHref = `${basePath}/api/auth/guest?redirectUrl=${encodeURIComponent(redirectTo)}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: router/updateSession are stable refs
  useEffect(() => {
    if (state.status === "failed") {
      toast({ type: "error", description: "Invalid credentials!" });
    } else if (state.status === "invalid_data") {
      toast({
        type: "error",
        description: "Failed validating your submission!",
      });
    } else if (state.status === "success") {
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
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="text-sm text-muted-foreground">
        Sign in to your account to continue
      </p>
      <AuthForm action={handleSubmit} defaultEmail={email}>
        <SubmitButton isSuccessful={isSuccessful}>Sign in</SubmitButton>
        <Button asChild className="w-full" variant="secondary">
          <a href={guestHref}>Continue as guest</a>
        </Button>
        <p className="text-center text-[13px] text-muted-foreground">
          {"No account? "}
          <Link
            className="text-foreground underline-offset-4 hover:underline"
            href={`/register?redirect=${encodeURIComponent(redirectTo)}`}
          >
            Sign up
          </Link>
        </p>
      </AuthForm>
    </>
  );
}
