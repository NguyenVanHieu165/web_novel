"use client";

import dynamic from "next/dynamic";
import { CommentSkeleton } from "@/components/common/InteractionSkeleton";

const LazyCommentSection = dynamic(() => import("./CommentSection"), {
  ssr: false,
  loading: CommentSkeleton,
});

export default LazyCommentSection;
