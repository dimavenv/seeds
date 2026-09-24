import { afterEach, describe, expect, it } from "vitest";
import type PocketBase from "pocketbase";
import {
  generateResetToken,
  hashResetToken,
  isResetToken,
  resetTokenTtlMs,
} from "@/lib/password-reset-token";
import {
  applyNewPassword,
  createPasswordLink,
  inspectPasswordToken,
} from "@/lib/password-reset";

afterEach(() => {
  delete process.env.PASSWORD_RESET_TTL_MIN;
});

describe("одноразовые ссылки пароля", () => {
  it("создаёт 256-битный URL-safe токен", () => {
    const tokens = Array.from({ length: 100 }, () => generateResetToken());
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const token of tokens) {
      expect(token).toHaveLength(43);
      expect(isResetToken(token)).toBe(true);
    }
  });

  it("хранит стабильный SHA-256 вместо исходного токена", () => {
    const token = generateResetToken();
    const hash = hashResetToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashResetToken(token)).toBe(hash);
  });

  it("по умолчанию действует 30 минут и ограничивает настройку", () => {
    expect(resetTokenTtlMs()).toBe(30 * 60 * 1000);
    process.env.PASSWORD_RESET_TTL_MIN = "60";
    expect(resetTokenTtlMs()).toBe(60 * 60 * 1000);
    process.env.PASSWORD_RESET_TTL_MIN = "2";
    expect(resetTokenTtlMs()).toBe(30 * 60 * 1000);
  });

  it("отбрасывает короткие и повреждённые токены", () => {
    expect(isResetToken("short")).toBe(false);
    expect(isResetToken("!".repeat(43))).toBe(false);
  });

  it("сохраняет только хеш и принимает ссылку ровно один раз", async () => {
    let tokenRecord: Record<string, unknown> | null = null;
    let changedPassword = "";
    const pb = {
      filter: (_query: string, params: Record<string, unknown>) => params,
      createBatch: () => {
        let recordId = "";
        let password = "";
        return {
          collection: () => ({
            delete: (id: string) => { recordId = id; },
            update: (_id: string, data: Record<string, unknown>) => { password = String(data.password); },
          }),
          send: async () => {
            if (!tokenRecord || tokenRecord.id !== recordId) throw { status: 400 };
            tokenRecord = null;
            changedPassword = password;
          },
        };
      },
      collection: (name: string) => {
        void name;
        return ({
        getFullList: async () => [],
        getFirstListItem: async (filter: { hash?: string }) => {
          if (!tokenRecord || tokenRecord.token_hash !== filter.hash) throw { status: 404 };
          return tokenRecord;
        },
        getOne: async () => ({ email: "user@example.com" }),
        create: async (data: Record<string, unknown>) => {
          tokenRecord = { id: "token-record", ...data };
          return tokenRecord;
        },
        delete: async (id: string) => {
          if (!tokenRecord || tokenRecord.id !== id) throw { status: 404 };
          tokenRecord = null;
        },
        update: async (_id: string, data: Record<string, unknown>) => {
          changedPassword = String(data.password ?? "");
          return {};
        },
        });
      },
    } as unknown as PocketBase;

    const link = await createPasswordLink(pb, "user-id", "reset");
    const raw = new URL(link.url).searchParams.get("token")!;
    const stored = tokenRecord as Record<string, unknown> | null;
    expect(stored?.token_hash).toBe(hashResetToken(raw));
    expect(JSON.stringify(stored)).not.toContain(raw);

    expect(await applyNewPassword(raw, "new-password", pb)).toMatchObject({ ok: true });
    expect(changedPassword).toBe("new-password");
    expect(await applyNewPassword(raw, "another-password", pb)).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("отклоняет просроченную ссылку", async () => {
    const raw = generateResetToken();
    const pb = {
      filter: (_query: string, params: Record<string, unknown>) => params,
      collection: (name: string) => {
        void name;
        return ({
        getFirstListItem: async () => ({
          id: "expired-token",
          user: "user-id",
          purpose: "reset",
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }),
        getOne: async () => ({ email: "user@example.com" }),
        });
      },
    } as unknown as PocketBase;
    expect(await inspectPasswordToken(raw, pb)).toBeNull();
  });
});
