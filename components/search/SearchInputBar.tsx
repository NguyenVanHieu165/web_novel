"use client";

import { useRef } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { storySearchMaxLength } from "@/schemas/story-query.schema";
import { useStorySearchNavigation } from "./StorySearchProvider";

export default function SearchInputBar() {
  const { keyword, pending, controller } = useStorySearchNavigation();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <form role="search" onSubmit={(event) => { event.preventDefault(); controller.submit(); }} className="relative mx-auto w-full max-w-2xl">
      <label htmlFor="story-keyword" className="sr-only">Tìm truyện theo tên, tác giả hoặc từ khóa</label>
      <div className="relative flex items-center">
        <div className="pointer-events-none absolute left-4 text-slate-400 dark:text-zinc-500" aria-hidden="true">
          {pending ? <Loader2 className="h-5 w-5 text-blue-600 motion-safe:animate-spin" /> : <Search className="h-5 w-5" />}
        </div>
        <input
          ref={inputRef} id="story-keyword" type="search" name="q" autoComplete="off" maxLength={storySearchMaxLength}
          value={keyword} onChange={(event) => controller.setKeyword(event.target.value)}
          placeholder="Nhập tên truyện, tác giả hoặc từ khóa…"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-12 text-sm text-slate-900 shadow-sm transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:py-4 sm:text-base dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {keyword && (
          <button type="button" aria-label="Xóa từ khóa tìm kiếm" onClick={() => { controller.update({ q: undefined }, { method: "replace" }); inputRef.current?.focus(); }}
            className="absolute right-3 rounded-full p-2 text-slate-400 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-zinc-100">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </form>
  );
}
