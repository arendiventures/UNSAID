import { getDb } from "@/lib/db/client";
import { reviewQueue } from "@/lib/services/episodes";
import { ReviewQueue } from "@/components/ReviewQueue";

export const dynamic = "force-dynamic";

export default function ReviewPage() {
  const q = reviewQueue(getDb());
  return <ReviewQueue heldTurns={q.heldTurns} pendingSources={q.pendingSources} />;
}
