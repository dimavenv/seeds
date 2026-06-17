"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProduct } from "@/app/admin/actions";

export default function DeleteProductButton({ id }: { id: number }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() => {
        if (!confirm("Удалить товар?")) return;
        startTransition(async () => {
          await deleteProduct(id);
          router.refresh();
        });
      }}
      disabled={pending}
      className="text-sm font-semibold text-accent-600 hover:underline disabled:opacity-50"
    >
      {pending ? "Удаление…" : "Удалить"}
    </button>
  );
}
