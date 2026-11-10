import { Suspense } from "react";
import { AuthGate } from "@/components/layout/AuthGate";
import { RegisterForm } from "@/components/onboarding/RegisterForm";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthGate mode="guest">
      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthGate>
  );
}
