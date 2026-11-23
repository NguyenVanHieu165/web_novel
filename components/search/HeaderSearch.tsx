"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Suggestion = {
  stories: Array<{ id: number; title: string; slug: string; cover: string; chapters: number; author: string }>;
  authors: Array<{ id: number; name: string }>;
};

const empty: Suggestion = { stories: [], authors: [] };

export default function HeaderSearch({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion>(empty);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : empty)
        .then((data: Suggestion) => { setSuggestions(data); setOpen(true); })
        .catch(() => undefined);
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/tim-kiem?q=${encodeURIComponent(q)}`);
    setOpen(false);
    onNavigate?.();
  };
  const hasResults = suggestions.stories.length > 0 || suggestions.authors.length > 0;

  return (
    <div ref={root} className={`relative ${mobile ? "w-full" : "hidden sm:block"}`}>
      <form role="search" onSubmit={submit}>
        <label htmlFor={mobile ? "mobile-header-search" : "header-search"} className="sr-only">Tìm truyện hoặc tác giả</label>
        <div className="relative">
          <Input
            id={mobile ? "mobile-header-search" : "header-search"}
            name="q"
            type="search"
            autoComplete="off"
            value={query}
            onFocus={() => setOpen(hasResults)}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm truyện, tác giả…"
            className={mobile ? "h-10 w-full rounded-full bg-muted pl-11 pr-10" : "h-9 w-44 rounded-full bg-muted pl-10 pr-9 xl:w-56 2xl:w-72"}
          />
          <Search aria-hidden="true" className={`absolute text-muted-foreground ${mobile ? "left-4 top-3 size-4" : "left-3.5 top-2.5 size-4"}`} />
          {query ? (
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => { setQuery(""); setSuggestions(empty); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full text-muted-foreground" aria-label="Xóa tìm kiếm">
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </form>

      {open && hasResults ? (
        <Card className="absolute z-50 mt-2 min-w-[280px] gap-0 overflow-hidden rounded-xl p-2 shadow-xl">
          {suggestions.authors.length ? (
            <div className="mb-2">
              <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Tác giả</p>
              {suggestions.authors.map((author) => (
                <Link key={author.id} href={`/tim-kiem?author=${encodeURIComponent(author.name)}`}
                  onClick={() => { setOpen(false); onNavigate?.(); }} className="block rounded-lg px-2 py-2 text-sm hover:bg-muted">
                  {author.name}
                </Link>
              ))}
            </div>
          ) : null}
          {suggestions.stories.length ? (
            <div>
              <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Truyện</p>
              {suggestions.stories.map((story) => (
                <Link key={story.id} href={`/truyen/${story.slug}`} onClick={() => { setOpen(false); onNavigate?.(); }}
                  className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted">
                  <Image src={story.cover} unoptimized alt="" width={32} height={42} className="h-10 w-8 rounded object-cover" />
                  <span className="min-w-0"><strong className="block truncate text-sm">{story.title}</strong><span className="block truncate text-xs text-muted-foreground">{story.author} · {story.chapters.toLocaleString("vi-VN")} chương</span></span>
                </Link>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
