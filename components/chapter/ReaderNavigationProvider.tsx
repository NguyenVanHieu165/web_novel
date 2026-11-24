"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState, useTransition,
  type ComponentProps, type MouseEvent, type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { shouldHandleReaderClick, waitForReaderLeave } from "@/lib/reader-navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ReaderNavigationContextValue {
  navigate: (href: string) => void;
  pending: boolean;
  error: string;
}

const ReaderNavigationContext = createContext<ReaderNavigationContextValue | null>(null);

export default function ReaderNavigationProvider({ chapterId, children }: { chapterId: number; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const navigating = useRef(false);

  useEffect(() => {
    if (!pending) navigating.current = false;
  }, [pending]);

  const navigate = useCallback((href: string) => {
    if (navigating.current || pending) return;
    navigating.current = true;
    setError("");
    startTransition(async () => {
      try {
        await waitForReaderLeave(chapterId);
        startTransition(() => router.push(href, { scroll: true }));
      } catch {
        navigating.current = false;
        setError("Không thể chuyển trang. Vui lòng thử lại.");
      }
    });
  }, [chapterId, pending, router]);

  return (
    <ReaderNavigationContext value={{ navigate, pending, error }}>
      {pending && <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 bg-blue-500 motion-safe:animate-pulse" />}
      <div className="sr-only" role="status" aria-live="polite">{pending ? "Đang chuyển trang đọc…" : ""}</div>
      {error && <Alert variant="destructive" role="alert" className="fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-md border-[var(--reader-error)]/30 bg-[var(--reader-surface)] text-[var(--reader-error)] shadow-lg"><AlertDescription className="text-center">{error}</AlertDescription></Alert>}
      {children}
    </ReaderNavigationContext>
  );
}

export function useReaderNavigation(): ReaderNavigationContextValue {
  const context = useContext(ReaderNavigationContext);
  if (!context) throw new Error("Reader navigation must be rendered inside ReaderNavigationProvider");
  return context;
}

type ReaderNavigationLinkProps = Omit<ComponentProps<typeof Link>, "href" | "prefetch" | "onNavigate"> & { href: string };

export function ReaderNavigationLink({ href, onClick, tabIndex, children, ...props }: ReaderNavigationLinkProps) {
  const { navigate, pending } = useReaderNavigation();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (!shouldHandleReaderClick({
      button: event.button, defaultPrevented: event.defaultPrevented,
      altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey,
      target: event.currentTarget.target, download: event.currentTarget.hasAttribute("download"),
    })) return;
    // Link sees preventDefault and leaves the single progress-aware push to the provider.
    event.preventDefault();
    navigate(href);
  };

  return (
    <Link {...props} href={href} scroll onClick={handleClick}
      aria-disabled={pending || props["aria-disabled"]} tabIndex={pending ? -1 : tabIndex}>
      {children}
    </Link>
  );
}
