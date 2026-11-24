export const CHAPTER_VIEW_ACTION = "CHAPTER_VIEW" as const;

export function chapterViewLogData(chapterId: number, storyId: number) {
  return {
    mucDo: "INFO",
    nguon: CHAPTER_VIEW_ACTION,
    thongDiep: "Ghi nhận lượt đọc chương",
    chiTiet: JSON.stringify({
      hanh_dong: CHAPTER_VIEW_ACTION,
      doi_tuong_id: chapterId,
      id_truyen: storyId,
    }),
  } as const;
}
