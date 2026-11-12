import { NextResponse } from "next/server";

/**
 * Android "verified app" file. When the Android app (APK made with
 * PWABuilder) is verified, it opens full-screen with no address bar.
 * Set in Vercel:
 *   ANDROID_PACKAGE_ID       e.g. app.vercel.trust_manager_rosy.twa
 *   ANDROID_SHA256_CERTS     the SHA-256 fingerprint(s) PWABuilder shows, comma-separated
 */
export const dynamic = "force-dynamic";

export function GET() {
  const pkg = process.env.ANDROID_PACKAGE_ID?.trim();
  const certs = (process.env.ANDROID_SHA256_CERTS ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const body = pkg && certs.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: certs } }]
    : [];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
