"use client";

import { Input } from "@/components/ui/input";
import type { StoryQuery } from "@/hooks/useStories";
import type { Dispatch, SetStateAction } from "react";

type StoryFilterProps = {
  query: StoryQuery;
  setQuery: Dispatch<SetStateAction<StoryQuery>>;
};

export default function StoryFilter({ query, setQuery }: StoryFilterProps) {
  return (
    <Input
      className="max-w-sm"
      placeholder="Tìm truyện..."
      value={query.search}
      onChange={(e) =>
        setQuery({ ...query, search: e.target.value, page: 1 })
      }
    />
  );
}
