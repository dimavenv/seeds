"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { pbAdmin } from "@/lib/pb/server";
import { siteUrl } from "@/lib/seo";
import { safeTarget } from "@/lib/tracking-links";

export async function createTrackingLink(
  form: FormData,
): Promise<{ error?: string; id?: string }> {
  if (!(await getSession()).isAdmin) return { error: "Доступ запрещён" };
  const title = String(form.get("title") || "").trim();
  const platform = String(form.get("platform") || "").trim();
  if (!title || title.length > 100 || !platform || platform.length > 60)
    return {
      error: "Введите название (до 100 символов) и платформу (до 60 символов)",
    };
  let target: string;
  try {
    target = safeTarget(String(form.get("target") || "/"), siteUrl());
  } catch (e) {
    return { error: (e as Error).message };
  }
  try {
    const pb = await pbAdmin();
    const record = await pb
      .collection("tracking_links")
      .create({ title, platform, target, active: true });
    revalidatePath("/admin/links");
    return { id: record.id };
  } catch {
    return {
      error:
        "Не удалось сохранить ссылку. Проверьте подключение и схему базы данных.",
    };
  }
}
export async function toggleTrackingLink(
  id: string,
  active: boolean,
): Promise<{ error?: string }> {
  if (!(await getSession()).isAdmin) return { error: "Доступ запрещён" };
  if (!/^[a-z0-9]{15}$/.test(id) || typeof active !== "boolean")
    return { error: "Некорректная ссылка" };
  try {
    const pb = await pbAdmin();
    await pb.collection("tracking_links").update(id, { active });
    revalidatePath("/admin/links");
    return {};
  } catch {
    return { error: "Не удалось изменить ссылку" };
  }
}
