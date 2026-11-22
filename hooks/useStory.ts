"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/axios";
import type { Story } from "@/hooks/useStories";

type StoryResult = { id: number; story: Story | null; error: string | null };
type StoryResponse = { success?: boolean; data?: Story; message?: string };

async function loadStory(id: number, signal: AbortSignal): Promise<StoryResult> {
    try {
        const res = await api.get<StoryResponse>(`/admin/stories/${id}`, { signal });
        if (res.data?.success === false) {
            throw new Error(res.data.message || "Lấy chi tiết truyện thất bại");
        }

        return { id, story: res.data?.data ?? null, error: null };
    } catch (err) {
        const error = err instanceof Error ? err.message : "Có lỗi khi lấy chi tiết truyện";
        return { id, story: null, error };
    }
}

export function useStory(id: number | null) {
    const validId = id && Number.isFinite(id) ? id : null;
    const [result, setResult] = useState<StoryResult | null>(null);
    const activeRequest = useRef<AbortController | null>(null);
    const currentResult = result?.id === validId ? result : null;

    if (result && !currentResult) setResult(null);

    const requestStory = useCallback(() => {
        if (validId === null) return;

        activeRequest.current?.abort();
        const controller = new AbortController();
        activeRequest.current = controller;
        return loadStory(validId, controller.signal).then((nextResult) => {
            if (!controller.signal.aborted) {
                activeRequest.current = null;
                setResult(nextResult);
            }
        });
    }, [validId]);

    useEffect(() => {
        void requestStory();
        return () => activeRequest.current?.abort();
    }, [requestStory]);

    const fetchStory = async () => {
        setResult(null);
        await requestStory();
    };

    return {
        story: currentResult?.story ?? null,
        loading: validId !== null && !currentResult,
        error: validId === null ? "ID không hợp lệ" : currentResult?.error ?? null,
        fetchStory,
    };
}
