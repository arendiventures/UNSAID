import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Host remote", robots: { index: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover" };

/** Phone-sized shell: no sidebar, safe-area padding, single column. */
export default function RemoteLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">{children}</div>;
}
