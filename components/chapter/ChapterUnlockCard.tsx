"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Coins, Lock } from "lucide-react";
import { z } from "zod";

import { useAuth } from "@/context/AuthContext";
import type { ChapterDetailData } from "@/lib/mappers/chapter.mapper";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ChapterUnlockCardProps {
  chapter: Pick<ChapterDetailData["chapter"], "idChuong" | "giaXu">;
  access: ChapterDetailData["access"];
  returnPath: string;
}

const purchaseResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  code: z.string().optional(),
  price: z.number().int().positive().optional(),
  balance: z.number().int().nonnegative().optional(),
});

const numberFormat = new Intl.NumberFormat("vi-VN");
const buttonStyles = "min-h-11 rounded-lg px-4 text-sm font-semibold focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40";

export default function ChapterUnlockCard({ chapter, access, returnPath }: ChapterUnlockCardProps) {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const requestInFlight = useRef(false);
  const [confirmedPrice, setConfirmedPrice] = useState<number | null>(null);
  const [purchasePending, setPurchasePending] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseComplete, setPurchaseComplete] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [updatedPrice, setUpdatedPrice] = useState<number | null>(null);
  const [updatedBalance, setUpdatedBalance] = useState<number | null>(null);
  const [refreshPending, startRefresh] = useTransition();

  const price = updatedPrice ?? chapter.giaXu;
  const balance = updatedBalance ?? access.balance ?? 0;
  const requiresLogin = access.requiresLogin || sessionExpired;
  const validPrice = Number.isSafeInteger(price) && price > 0 && price <= 2_147_483_647;
  const hasEnoughCoins = balance >= price;
  const showConfirmation = confirmedPrice !== null && confirmedPrice === price;
  const refreshContent = () => startRefresh(() => router.refresh());

  const handlePurchase = async () => {
    if (requestInFlight.current || !showConfirmation || !validPrice || !hasEnoughCoins) return;
    requestInFlight.current = true;
    setPurchasePending(true);
    setPurchaseError(null);

    try {
      const response = await fetch(`/api/chapters/${chapter.idChuong}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedPrice: confirmedPrice }),
      });
      const parsed = purchaseResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error("Không thể xác nhận kết quả giao dịch. Vui lòng tải lại chương trước khi thử lại.");
      }

      const result = parsed.data;
      if (result.balance !== undefined) setUpdatedBalance(result.balance);
      if (!response.ok || !result.success) {
        if (response.status === 401) {
          setSessionExpired(true);
          setConfirmedPrice(null);
          refreshContent();
        }
        if (response.status === 409) {
          setConfirmedPrice(null);
          if (result.code === "PRICE_CHANGED" && result.price !== undefined) setUpdatedPrice(result.price);
          refreshContent();
        }
        throw new Error(result.message || "Không thể mở khóa chương. Vui lòng thử lại.");
      }

      setPurchaseComplete(true);
      setConfirmedPrice(null);
      refreshContent();
      void refreshUser();
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : "Không thể mở khóa chương. Vui lòng thử lại.");
    } finally {
      requestInFlight.current = false;
      setPurchasePending(false);
    }
  };

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-[var(--reader-border)] bg-[var(--reader-surface)] p-6 text-center text-[var(--reader-text)] shadow-sm">
      <Lock className="mx-auto mb-3 h-8 w-8 text-[var(--reader-accent)]" aria-hidden="true" />
      <h2 className="text-lg font-black">Mở khóa chương VIP</h2>
      <p className="mt-2 text-sm leading-6 opacity-80">
        {requiresLogin
          ? "Đăng nhập để mở khóa chương trong tài khoản của bạn."
          : "Chương này chưa được mở khóa trong tài khoản của bạn."}
      </p>
      {purchaseError && <Alert variant="destructive" role="alert" className="mt-3 border-[var(--reader-error)]/30 bg-transparent text-left text-[var(--reader-error)]"><AlertDescription>{purchaseError}</AlertDescription></Alert>}

      {requiresLogin ? (
        <Button asChild className={`mt-5 bg-[var(--reader-accent)] text-[var(--reader-surface)] hover:bg-[var(--reader-accent)] hover:opacity-90 ${buttonStyles}`}>
          <Link href={`/dang-nhap?redirect=${encodeURIComponent(returnPath)}`}>Đăng nhập để mở khóa</Link>
        </Button>
      ) : (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-semibold tabular-nums" aria-live="polite">
            Giá: {numberFormat.format(price)} xu
            <span className="mx-2" aria-hidden="true">·</span>
            Ví: {numberFormat.format(balance)} xu
          </p>

          {purchaseComplete ? (
            <div className="space-y-3">
              <Alert variant="success" role="status" className="border-[var(--reader-success)]/30 bg-transparent text-left text-[var(--reader-success)]"><AlertDescription>Đã mở khóa chương. {refreshPending ? "Đang tải nội dung…" : "Bạn có thể tải lại để đọc."}</AlertDescription></Alert>
              <Button type="button" onClick={refreshContent} disabled={refreshPending} className={`bg-[var(--reader-accent)] text-[var(--reader-surface)] hover:bg-[var(--reader-accent)] hover:opacity-90 ${buttonStyles}`}>
                Tải lại nội dung
              </Button>
            </div>
          ) : !validPrice ? (
            <p className="text-sm" role="status">Giá chương đang được cập nhật. Vui lòng quay lại sau.</p>
          ) : showConfirmation ? (
            <fieldset disabled={purchasePending || refreshPending} className="space-y-3 rounded-lg border border-[var(--reader-border)] bg-[var(--reader-bg)] p-4 text-left">
              <legend className="px-1 text-sm font-bold">Xác nhận mở khóa chương</legend>
              <p className="text-sm leading-6 tabular-nums">
                Mở khóa chương trong tài khoản của bạn với {numberFormat.format(price)} xu.
                {hasEnoughCoins && <> Số dư sau giao dịch: {numberFormat.format(balance - price)} xu.</>}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="outline" onClick={() => setConfirmedPrice(null)} className={`border-[var(--reader-border)] bg-transparent text-[var(--reader-text)] hover:bg-[var(--reader-surface)] hover:text-[var(--reader-text)] ${buttonStyles}`}>
                  Hủy
                </Button>
                <Button type="button" onClick={handlePurchase} disabled={!hasEnoughCoins} className={`bg-[var(--reader-accent)] text-[var(--reader-surface)] hover:bg-[var(--reader-accent)] hover:opacity-90 ${buttonStyles}`}>
                  {purchasePending ? "Đang mở khóa…" : "Xác nhận mở khóa"}
                </Button>
              </div>
            </fieldset>
          ) : (
            <Button
              type="button"
              onClick={() => {
                setPurchaseError(null);
                setConfirmedPrice(price);
              }}
              disabled={!hasEnoughCoins || purchasePending || refreshPending}
              className={`bg-[var(--reader-accent)] text-[var(--reader-surface)] hover:bg-[var(--reader-accent)] hover:opacity-90 ${buttonStyles}`}
            >
              <Coins className="h-4 w-4" aria-hidden="true" />
              Mở khóa với {numberFormat.format(price)} xu
            </Button>
          )}
          {!purchaseComplete && validPrice && !hasEnoughCoins && (
            <p className="text-sm" role="status">Ví chưa đủ xu để mở khóa chương này.</p>
          )}
        </div>
      )}
    </section>
  );
}
