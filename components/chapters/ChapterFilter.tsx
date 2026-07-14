"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

type StoryOption = {
  idTruyen: number;
  tenTruyen: string;
};

type ChapterQuery = {
  search: string;
  idTruyen: string;
  page: number;
  limit: number;
};

type Props = {
  query: ChapterQuery;
  stories: StoryOption[];
  setQuery: (query: ChapterQuery) => void;
};

export default function ChapterFilter({ query, stories, setQuery }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border bg-white p-3 md:grid-cols-[1fr_280px]">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          value={query.search}
          onChange={(e) =>
            setQuery({
              ...query,
              search: e.target.value,
              page: 1,
            })
          }
          placeholder="Tìm theo tiêu đề chương, slug hoặc tên truyện..."
          className="h-9 pl-10"
        />
      </div>

      <Select
        value={query.idTruyen}
        onValueChange={(value) =>
          setQuery({
            ...query,
            idTruyen: value,
            page: 1,
          })
        }
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Lọc theo truyện" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả truyện</SelectItem>
          {stories.map((story) => (
            <SelectItem key={story.idTruyen} value={String(story.idTruyen)}>
              {story.tenTruyen}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
