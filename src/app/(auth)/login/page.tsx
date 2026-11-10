import { Suspense } from "react";
import { AuthGate } from "@/components/layout/AuthGate";
import { LoginForm } from "@/components/onboarding/LoginForm";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthGate mode="guest">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthGate>
  );
}
