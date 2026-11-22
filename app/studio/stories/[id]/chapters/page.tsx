import { notFound } from "next/navigation";
import StudioChapters from "@/components/studio/StudioChapters";
import { requireStudioUser } from "../../../session";

export default async function StudioChaptersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const user = await requireStudioUser();
  return <StudioChapters storyId={Number(id)} accountId={user.idTaiKhoan} />;
}
