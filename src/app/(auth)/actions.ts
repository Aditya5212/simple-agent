"use server";

import { z } from "zod";

import { createUser, getUser } from "@/lib/db/queries";

import { signIn } from "./auth";

const authFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type AuthLogContext = {
  action: "login" | "register";
  status: "invalid_data" | "failed";
  hasEmail: boolean;
  hasPassword: boolean;
};

function logAuthIssue(context: AuthLogContext, error: unknown) {
  const errorName = error instanceof Error ? error.name : "unknown";
  if (errorName === "CredentialsSignin") {
    return;
  }

  const payload = {
    event: "auth_issue",
    ...context,
    errorName,
    errorMessage: error instanceof Error ? error.message : "unknown",
  };

  console.warn(JSON.stringify(payload));
}

export type LoginActionState = {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
};

export const login = async (
  _: LoginActionState,
  formData: FormData
): Promise<LoginActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const result = await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    const error =
      typeof result === "object" && result !== null && "error" in result
        ? (result as { error?: string | null }).error
        : null;

    if (error) {
      return { status: "failed" };
    }

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logAuthIssue(
        {
          action: "login",
          status: "invalid_data",
          hasEmail: Boolean(formData.get("email")),
          hasPassword: Boolean(formData.get("password")),
        },
        error
      );
      return { status: "invalid_data" };
    }

    logAuthIssue(
      {
        action: "login",
        status: "failed",
        hasEmail: Boolean(formData.get("email")),
        hasPassword: Boolean(formData.get("password")),
      },
      error
    );

    return { status: "failed" };
  }
};

export type RegisterActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "user_exists"
    | "invalid_data";
};

export const register = async (
  _: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const [user] = await getUser(validatedData.email);

    if (user) {
      return { status: "user_exists" } as RegisterActionState;
    }
    await createUser(validatedData.email, validatedData.password);
    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logAuthIssue(
        {
          action: "register",
          status: "invalid_data",
          hasEmail: Boolean(formData.get("email")),
          hasPassword: Boolean(formData.get("password")),
        },
        error
      );
      return { status: "invalid_data" };
    }

    logAuthIssue(
      {
        action: "register",
        status: "failed",
        hasEmail: Boolean(formData.get("email")),
        hasPassword: Boolean(formData.get("password")),
      },
      error
    );

    return { status: "failed" };
  }
};
