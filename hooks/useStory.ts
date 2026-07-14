"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/axios";
import type { Story } from "@/hooks/useStories";

export function useStory(id: number | null) {
    const [story, setStory] = useState<Story | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStory = useCallback(async () => {
        if (!id || !Number.isFinite(id)) {
            setStory(null);
            setLoading(false);
            setError("ID không hợp lệ");
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const res = await api.get(`/admin/stories/${id}`);

            if (res.data?.success === false) {
                throw new Error(res.data.message || "Lấy chi tiết truyện thất bại");
            }

            setStory(res.data?.data ?? null);
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : "Có lỗi khi lấy chi tiết truyện";

            setError(message);
            setStory(null);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchStory();
    }, [fetchStory]);

    return {
        story,
        loading,
        error,
        fetchStory,
    };
}