"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateReviewStatus } from "@/app/admin/actions";
import type { ReviewStatus } from "@/lib/types";

export default function ReviewModeration({
  id,
  status,
}: {
  id: number;
  status: ReviewStatus;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const set = (s: ReviewStatus) =>
    start(async () => {
      await updateReviewStatus(id, s);
      router.refresh();
    });

  return (
    <div className="flex gap-2">
      {status !== "approved" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => set("approved")}
          className="btn-primary !py-1.5"
        >
          Одобрить
        </button>
      )}
      {status !== "rejected" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => set("rejected")}
          className="btn-outline !py-1.5"
        >
          Отклонить
        </button>
      )}
    </div>
  );
}
