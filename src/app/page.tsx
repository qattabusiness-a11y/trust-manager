import { AuthGate } from "@/components/layout/AuthGate";

/** Root: the guard decides between login, onboarding and the dashboard. */
export default function Home() {
  return <AuthGate mode="guest">{null}</AuthGate>;
}
