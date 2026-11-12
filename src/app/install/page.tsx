import type { Metadata } from "next";
import { InstallPage } from "./InstallPage";

export const metadata: Metadata = {
  title: "Install the app",
  description: "Install Trust Manager on your iPhone or Android phone — free, no app store needed.",
};

export default function Page() {
  return <InstallPage apkUrl={process.env.NEXT_PUBLIC_ANDROID_APK_URL || null} />;
}
