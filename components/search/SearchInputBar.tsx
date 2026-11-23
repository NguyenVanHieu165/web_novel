"use client";

import { useRef } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { storySearchMaxLength } from "@/schemas/story-query.schema";
import { useStorySearchNavigation } from "./StorySearchProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SearchInputBar() {
  const { keyword, pending, controller } = useStorySearchNavigation();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <form role="search" onSubmit={(event) => { event.preventDefault(); controller.submit(); }} className="relative mx-auto w-full max-w-2xl">
      <label htmlFor="story-keyword" className="sr-only">Tìm truyện theo tên, tác giả hoặc từ khóa</label>
      <div className="relative flex items-center">
        <div className="pointer-events-none absolute left-4 z-10 text-muted-foreground" aria-hidden="true">
          {pending ? <Loader2 className="size-5 text-primary motion-safe:animate-spin" /> : <Search className="size-5" />}
        </div>
        <Input
          ref={inputRef} id="story-keyword" type="search" name="q" autoComplete="off" maxLength={storySearchMaxLength}
          value={keyword} onChange={(event) => controller.setKeyword(event.target.value)}
          placeholder="Nhập tên truyện, tác giả hoặc từ khóa…"
          className="h-12 rounded-2xl bg-card pl-12 pr-12 text-sm shadow-sm sm:h-14 sm:text-base [&::-webkit-search-cancel-button]:appearance-none"
        />
        {keyword && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Xóa từ khóa tìm kiếm"
            onClick={() => { controller.update({ q: undefined }, { method: "replace" }); inputRef.current?.focus(); }}
            className="absolute right-3 rounded-full text-muted-foreground">
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
    </form>
  );
}
