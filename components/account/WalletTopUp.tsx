"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Copy, LoaderCircle, QrCode } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";

type TopUpStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";

export interface TopUpPackageOption {
  id: string;
  name: string;
  amountVnd: number;
  baseCoins: number;
  bonusCoins: number;
  totalCoins: number;
  badge: string | null;
}

interface TopUpOrder {
  code: string;
  status: TopUpStatus;
  package: TopUpPackageOption;
  bank: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
    amountVnd: number;
    transferContent: string;
    qrUrl: string;
  };
}

const number = new Intl.NumberFormat("vi-VN");
const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
const pollingIntervalMs = 3_000;
const pollingMaxDelayMs = 30_000;
const pollingLifetimeMs = 15 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readMessage(payload: unknown, fallback: string) {
  return isRecord(payload) && typeof payload.message === "string" ? payload.message : fallback;
}

function readCreatedOrder(payload: unknown, selectedPackage: TopUpPackageOption): TopUpOrder | null {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
    return null;
  }

  const { data } = payload;
  if (!isRecord(data.bank)) return null;
  const { bank } = data;
  if (
    typeof data.code !== "string" || data.status !== "PENDING" ||
    typeof bank.bankCode !== "string" || typeof bank.accountNumber !== "string" ||
    typeof bank.accountName !== "string" || typeof bank.amountVnd !== "number" ||
    typeof bank.transferContent !== "string" || typeof bank.qrUrl !== "string"
  ) {
    return null;
  }

  return {
    code: data.code,
    status: data.status,
    package: selectedPackage,
    bank: {
      bankCode: bank.bankCode,
      accountNumber: bank.accountNumber,
      accountName: bank.accountName,
      amountVnd: bank.amountVnd,
      transferContent: bank.transferContent,
      qrUrl: bank.qrUrl,
    },
  };
}

function readStatus(payload: unknown): TopUpStatus | null {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) return null;
  const status = payload.data.status;
  return status === "PENDING" || status === "SUCCESS" || status === "FAILED" || status === "CANCELLED"
    ? status
    : null;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function WalletTopUp({ packages }: { packages: readonly TopUpPackageOption[] }) {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [order, setOrder] = useState<TopUpOrder | null>(null);
  const [open, setOpen] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const pendingOrderCode = open && order?.status === "PENDING" ? order.code : null;
  const pendingOrderCoins = open && order?.status === "PENDING" ? order.package.totalCoins : null;

  useEffect(() => {
    if (!pendingOrderCode || pendingOrderCoins === null) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let retryDelay = pollingIntervalMs;
    const deadline = Date.now() + pollingLifetimeMs;

    const scheduleNextCheck = () => {
      if (Date.now() >= deadline) {
        setStatusError("Đã dừng kiểm tra tự động sau 15 phút. Hãy tải lại trang để xem trạng thái mới nhất.");
        return;
      }
      timer = setTimeout(checkStatus, retryDelay);
    };

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/wallet/topup/${encodeURIComponent(pendingOrderCode)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        const status = readStatus(payload);
        if (!response.ok || !status) {
          const message = readMessage(payload, "Không thể kiểm tra trạng thái đơn nạp.");
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            setStatusError(message);
            return;
          }
          throw new Error(message);
        }

        setStatusError(null);
        retryDelay = pollingIntervalMs;
        if (status === "SUCCESS") {
          setOrder((current) => current ? { ...current, status } : current);
          toast.success(`Đã cộng ${number.format(pendingOrderCoins)} xu vào ví`);
          router.refresh();
          await refreshUser();
          return;
        }
        if (status === "FAILED" || status === "CANCELLED") {
          setOrder((current) => current ? { ...current, status } : current);
          return;
        }
      } catch (error) {
        if (isAbortError(error)) return;
        setStatusError(error instanceof Error ? error.message : "Không thể kiểm tra trạng thái đơn nạp.");
        retryDelay = Math.min(retryDelay * 2, pollingMaxDelayMs);
      }

      scheduleNextCheck();
    };

    timer = setTimeout(checkStatus, pollingIntervalMs);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pendingOrderCode, pendingOrderCoins, refreshUser, router]);

  const createOrder = async (selectedPackage: TopUpPackageOption) => {
    setCreatingId(selectedPackage.id);
    setCreateError(null);
    setStatusError(null);

    try {
      const response = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: selectedPackage.id }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const created = readCreatedOrder(payload, selectedPackage);
      if (!response.ok || !created) throw new Error(readMessage(payload, "Không thể tạo yêu cầu nạp xu."));

      setOrder(created);
      setOpen(true);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Không thể tạo yêu cầu nạp xu.");
    } finally {
      setCreatingId(null);
    }
  };

  const copyTransferDetails = async () => {
    if (!order) return;
    const details = [
      `Ngân hàng: ${order.bank.bankCode}`,
      `Số tài khoản: ${order.bank.accountNumber}`,
      `Chủ tài khoản: ${order.bank.accountName}`,
      `Số tiền: ${currency.format(order.bank.amountVnd)}`,
      `Nội dung: ${order.bank.transferContent}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(details);
      toast.success("Đã sao chép thông tin chuyển khoản");
    } catch {
      toast.error("Không thể sao chép. Hãy sao chép thủ công thông tin trong hộp thoại.");
    }
  };

  const isCreating = creatingId !== null;
  const statusLabel = order?.status === "SUCCESS"
    ? "Đã hoàn tất"
    : order?.status === "FAILED"
      ? "Thất bại"
      : order?.status === "CANCELLED"
        ? "Đã hủy"
        : "Đang chờ thanh toán";

  return (
    <section aria-labelledby="top-up-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="top-up-heading" className="text-balance text-xl font-semibold">Chọn Gói Nạp Xu</h2>
        <p className="text-pretty text-sm text-muted-foreground">
          Chuyển khoản bằng mã QR; xu được cộng tự động sau khi ngân hàng xác nhận.
        </p>
      </div>

      {createError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{createError} Vui lòng thử lại sau.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy={isCreating}>
        {packages.map((item) => (
          <Card key={item.id} className="relative flex h-full flex-col overflow-hidden">
            {item.badge ? (
              <Badge className="absolute right-4 top-4" variant={item.id === "popular_50k" ? "default" : "secondary"}>
                {item.badge}
              </Badge>
            ) : null}
            <CardHeader className={item.badge ? "pr-28" : undefined}>
              <CardTitle className="text-base">{item.name}</CardTitle>
              <CardDescription className="tabular-nums">{currency.format(item.amountVnd)}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-2">
              <p className="text-2xl font-bold tabular-nums">{number.format(item.totalCoins)} xu</p>
              <p className="text-sm text-muted-foreground">
                {number.format(item.baseCoins)} xu cơ bản
                {item.bonusCoins > 0 ? ` + ${number.format(item.bonusCoins)} xu thưởng` : ""}
              </p>
            </CardContent>
            <CardFooter>
              <Button
                type="button"
                className="w-full"
                disabled={isCreating}
                onClick={() => void createOrder(item)}
              >
                {creatingId === item.id ? (
                  <><LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Đang tạo mã…</>
                ) : (
                  <><QrCode aria-hidden="true" />Nạp {number.format(item.totalCoins)} xu</>
                )}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Alert variant="info">
        <AlertDescription>
          Chuyển đúng số tiền và giữ nguyên nội dung để hệ thống nhận diện giao dịch tự động.
        </AlertDescription>
      </Alert>

      <Dialog open={open} onOpenChange={setOpen}>
        {order ? (
          <DialogContent>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <DialogTitle>Quét Mã QR Để Nạp Xu</DialogTitle>
                <Badge variant={order.status === "SUCCESS" ? "success" : order.status === "PENDING" ? "warning" : "destructive"}>
                  {statusLabel}
                </Badge>
              </div>
              <DialogDescription>
                Đơn {order.code} · nhận {number.format(order.package.totalCoins)} xu
              </DialogDescription>
            </DialogHeader>

            <div className="mx-auto overflow-hidden rounded-xl border bg-white p-2">
              <Image
                src={order.bank.qrUrl}
                alt={`Mã QR chuyển khoản cho đơn ${order.code}`}
                width={320}
                height={320}
                unoptimized
                className="size-auto max-h-72 w-full max-w-72"
              />
            </div>

            <dl className="grid gap-2 rounded-xl border bg-muted/30 p-4 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">Ngân hàng</dt>
              <dd className="break-words font-medium sm:text-right" translate="no">{order.bank.bankCode}</dd>
              <dt className="text-muted-foreground">Số tài khoản</dt>
              <dd className="break-all font-medium tabular-nums sm:text-right" translate="no">{order.bank.accountNumber}</dd>
              <dt className="text-muted-foreground">Chủ tài khoản</dt>
              <dd className="break-words font-medium sm:text-right">{order.bank.accountName}</dd>
              <dt className="text-muted-foreground">Số tiền</dt>
              <dd className="font-semibold tabular-nums sm:text-right">{currency.format(order.bank.amountVnd)}</dd>
              <dt className="text-muted-foreground">Nội dung</dt>
              <dd className="break-all font-semibold text-primary sm:text-right" translate="no">{order.bank.transferContent}</dd>
            </dl>

            {order.status === "SUCCESS" ? (
              <Alert variant="success" role="status" aria-live="polite">
                <CheckCircle2 aria-hidden="true" />
                <AlertDescription>
                  Thanh toán thành công. {number.format(order.package.totalCoins)} xu đã được cộng vào ví.
                </AlertDescription>
              </Alert>
            ) : order.status === "PENDING" ? (
              <Alert variant={statusError ? "warning" : "info"} role="status" aria-live="polite">
                {statusError ? null : <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
                <AlertDescription>
                  {statusError ?? "Hệ thống đang tự động kiểm tra trạng thái mỗi 3 giây…"}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive" role="alert">
                <AlertDescription>Đơn nạp không hoàn tất. Vui lòng tạo đơn mới hoặc liên hệ hỗ trợ.</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Đóng</Button>
              </DialogClose>
              <Button type="button" onClick={() => void copyTransferDetails()}>
                <Copy aria-hidden="true" />Sao Chép Thông Tin
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}
