"use client";
import { useId, useRef, useState } from "react";
import { X } from "lucide-react";
import type { StoryOption } from "@/hooks/useChapters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function StoryCombobox({ stories, value, onChange }: { stories: StoryOption[]; value?: number; onChange: (value: number | undefined) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const selected = stories.find((story) => story.idTruyen === value);
  const matching = stories.filter((story) => story.tenTruyen.normalize("NFC").toLocaleLowerCase("vi").includes(search.normalize("NFC").toLocaleLowerCase("vi")));
  const choose = (storyId: number) => { onChange(storyId); setOpen(false); setSearch(""); input.current?.focus(); };
  return <div className="relative min-w-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id} className="mb-1 block text-sm font-medium">Truyện</label>
    <Input ref={input} id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open && matching[active] ? `${id}-${matching[active].idTruyen}` : undefined} autoComplete="off" className="pr-10" placeholder={selected?.tenTruyen || "Tìm trong tất cả truyện…"} value={open ? search : selected?.tenTruyen || (value ? `Truyện #${value}` : "")} onFocus={() => { setOpen(true); setSearch(""); setActive(0); }} onChange={(event) => { setSearch(event.target.value); setOpen(true); setActive(0); }} onKeyDown={(event) => {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((current) => Math.max(0, Math.min(matching.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
      if (event.key === "Enter" && open) { event.preventDefault(); if (matching[active]) choose(matching[active].idTruyen); }
    }} />
    {value && <Button type="button" size="icon" variant="ghost" aria-label="Xóa lựa chọn truyện" className="absolute bottom-0 right-0 size-9" onClick={() => { onChange(undefined); setSearch(""); }}><X className="size-4" aria-hidden="true" /></Button>}
    {open && <div id={`${id}-list`} role="listbox" aria-label="Danh sách truyện" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
      {matching.length === 0 ? <p className="p-3 text-sm">Không tìm thấy truyện</p> : matching.map((story, index) => <button key={story.idTruyen} id={`${id}-${story.idTruyen}`} type="button" role="option" aria-selected={story.idTruyen === value} className={`block w-full break-words rounded px-3 py-2 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${index === active ? "bg-accent" : ""}`} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(story.idTruyen)}>{story.tenTruyen}</button>)}
    </div>}
  </div>;
}