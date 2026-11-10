import { AuthGate } from "@/components/layout/AuthGate";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const metadata = { title: "Set up your household" };

export default function OnboardingPage() {
  return (
    <AuthGate mode="onboarding">
      <OnboardingWizard />
    </AuthGate>
  );
}
