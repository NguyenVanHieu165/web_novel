import type { Metadata } from "next";
import StudioDashboard from "@/components/studio/StudioDashboard";

export const metadata: Metadata = { title: "Khu vực sáng tác | WebNovel", robots: { index: false, follow: false } };
export default function StudioPage() { return <StudioDashboard />; }
