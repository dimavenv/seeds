"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrderTracking } from "@/app/admin/actions";

export default function OrderTrackingInput({
  id,
  tracking,
}: {
  id: string;
  tracking: string | null;
}) {
  const [value, setValue] = useState(tracking ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      await updateOrderTracking(id, value);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Трек-номер"
        className="input !w-44 !py-1.5 text-sm"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending || value === (tracking ?? "")}
        className="btn-outline !py-1.5"
      >
        {pending ? "…" : saved ? "✓" : "Сохранить"}
      </button>
    </div>
  );
}
