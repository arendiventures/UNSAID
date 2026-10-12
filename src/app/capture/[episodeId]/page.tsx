import { CaptureView } from "@/components/CaptureView";

export const dynamic = "force-dynamic";

export const metadata = { title: "Capture", robots: { index: false } };

export default async function CapturePage({ params, searchParams }: { params: Promise<{ episodeId: string }>; searchParams: Promise<{ captions?: string; audio?: string }> }) {
  const { episodeId } = await params;
  const sp = await searchParams;
  return <CaptureView episodeId={episodeId} captions={sp.captions !== "0"} audio={sp.audio === "1" || sp.audio === "guest" ? "guest" : sp.audio === "browser" ? "browser" : "off"} />;
}
