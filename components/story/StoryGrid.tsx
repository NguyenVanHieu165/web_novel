import StoryCard, { StoryCardData } from "./StoryCard";

interface StoryGridProps {
  stories: StoryCardData[];
  cols?: 3 | 4 | 5;
}

const COLS_CLASS: Record<3 | 4 | 5, string> = {
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
};

export default function StoryGrid({ stories, cols = 5 }: StoryGridProps) {
  if (!stories || stories.length === 0) {
    return (
      <div className="py-16 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800">
        <p className="text-sm text-slate-400 italic">Chưa có truyện nào.</p>
      </div>
    );
  }

  return (
    <div className={`grid ${COLS_CLASS[cols]} gap-4`}>
      {stories.map((story) => (
        <StoryCard key={story.idTruyen} story={story} />
      ))}
    </div>
  );
}
