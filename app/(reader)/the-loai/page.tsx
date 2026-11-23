import type { Metadata } from "next";
import Link from "next/link";
import { getAllGenresWithCount } from "@/lib/queries/genre.query";
import { Layers, ChevronRight } from "lucide-react";
import SectionHeader from "@/components/common/SectionHeader";
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Tất Cả Thể Loại Truyện | WebNovel",
  description:
    "Khám phá danh sách đầy đủ các thể loại truyện chữ: Tiên Hiệp, Kiếm Hiệp, Ngôn Tình, Đô Thị, Huyền Huyễn, Khoa Huyễn…",
};

export default async function GenresIndexPage() {
  const genres = await getAllGenresWithCount();
  const totalStories = genres.reduce((acc, g) => acc + g.storyCount, 0);

  return (
    <div className="space-y-10 pb-16">
      {/* Header Banner */}
      <PageHeader className="relative overflow-hidden rounded-3xl bg-card p-8 shadow-xl sm:p-12">
        <PageHeaderContent className="relative z-10 max-w-2xl space-y-4">
          <PageHeaderEyebrow className="flex items-center gap-2 text-primary"><Layers aria-hidden="true" className="size-3.5" />Phân loại thư viện</PageHeaderEyebrow>
          <PageHeaderTitle className="text-3xl sm:text-4xl lg:text-5xl">Danh Mục Thể Loại</PageHeaderTitle>
          <PageHeaderDescription className="text-sm leading-relaxed sm:text-base">
            Hàng ngàn tác phẩm được tuyển chọn kỹ lưỡng qua {genres.length} thể loại phong phú. Dễ dàng tìm kiếm thế giới kỳ ảo phù hợp nhất với sở thích của bạn.
          </PageHeaderDescription>
          <div className="flex items-center gap-6 pt-2 text-xs text-muted-foreground sm:text-sm">
            <div>
              <span className="mr-1 text-base font-bold text-foreground">{genres.length}</span> Thể loại
            </div>
            <div className="size-1 rounded-full bg-border" />
            <div>
              <span className="mr-1 text-base font-bold text-foreground">{totalStories}</span> Tác phẩm
            </div>
          </div>
        </PageHeaderContent>
      </PageHeader>

      {/* Genres Grid */}
      <section className="space-y-6">
        <SectionHeader title="Tất Cả Thể Loại" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
          {genres.map((genre) => (
            <Link
              key={genre.idTheLoai}
              href={`/the-loai/${genre.slug}`}
              className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full justify-between rounded-2xl transition-[border-color,box-shadow,transform] duration-300 group-hover:-translate-y-1 group-hover:border-primary/50 group-hover:shadow-lg">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base transition-colors group-hover:text-primary">
                    {genre.tenTheLoai}
                  </CardTitle>
                  <Badge variant="info" className="shrink-0">
                    {genre.storyCount} truyện
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {genre.moTa || `Danh sách các tác phẩm đặc sắc thuộc thể loại ${genre.tenTheLoai}.`}
                </p>
              </CardContent>

              <CardFooter className="flex items-center justify-between border-t pt-4 text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
                <span>Xem danh sách</span>
                <ChevronRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
              </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
