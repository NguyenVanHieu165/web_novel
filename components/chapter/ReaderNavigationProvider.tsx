"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState, useTransition,
  type ComponentProps, type MouseEvent, type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { shouldHandleReaderClick, waitForReaderLeave } from "@/lib/reader-navigation";

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
      {error && <p role="alert" className="fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</p>}
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
    <Link {...props} href={href} prefetch={false} scroll onClick={handleClick}
      aria-disabled={pending || props["aria-disabled"]} tabIndex={pending ? -1 : tabIndex}>
      {children}
    </Link>
  );
}
