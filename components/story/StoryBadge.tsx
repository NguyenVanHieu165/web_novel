import { cn } from "@/lib/utils";

type BadgeVariant = "hot" | "moi" | "full" | "dang-ra";

const BADGE_CONFIG: Record<
  BadgeVariant,
  { label: string; className: string }
> = {
  hot: {
    label: "HOT",
    className:
      "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md shadow-orange-500/30",
  },
  moi: {
    label: "MỚI",
    className:
      "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md shadow-blue-500/30",
  },
  full: {
    label: "FULL",
    className:
      "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/30",
  },
  "dang-ra": {
    label: "Đang ra",
    className:
      "bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-md shadow-violet-500/30",
  },
};

interface StoryBadgeProps {
  variant: BadgeVariant;
  className?: string;
}

export default function StoryBadge({ variant, className }: StoryBadgeProps) {
  const config = BADGE_CONFIG[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider leading-none",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
