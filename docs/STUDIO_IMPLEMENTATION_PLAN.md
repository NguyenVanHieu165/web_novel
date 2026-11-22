# Studio và trình soạn thảo chương — 2026-11-22

## 1. Understand

Đã inspect schema, session DB, Admin chapters, ChapterForm, API chapter/purchase và package bằng LeanCTX. Giữ nguyên schema/migrations và luồng cộng tác CodeMirror hiện có. Schema thực tế dùng `TacGiaDich`, `ViTien`, `LichSuGiaoDich`; không có FK nối tài khoản và tác giả.

## 2. Analyze

Không suy đoán ownership từ tên tài khoản/tác giả (có thể trùng và thay đổi). Dùng bản ghi server quản lý trong `CaiDatHeThong`, khóa `studio.story.<id>` và `studio.author.<accountId>`, gắn đúng quan hệ tác giả chính. So với file riêng, registry trong DB có transaction và dùng được trên nhiều instance; so với thêm cột, không cần sửa schema. Quyền phải được kiểm tra lại trong transaction.

Chương ẩn dùng `isDeleted=true`, kèm registry `studio.chapter.<id>` để phân biệt nháp và theo dõi thông báo xuất bản đầu tiên. Chương công khai dùng false. Không hiển thị nội dung nháp qua API độc giả. Xu tác giả là `floor(giaXu * 70 / 100)` vì ví dùng số nguyên; ghi ledger dương loại `mua_chuong` và cùng transaction với debit/mở khóa. Không chia xu cho tự mua.

## 3. Plan

1. Service viết/import dùng chung, schema Zod, khóa truyện, kiểm tra hai UNIQUE, NFC và notification sau commit.
2. Parser TXT/MD UTF-8 và DOCX bằng mammoth, 10 MB, kiểm tra giới hạn ZIP trước giải nén; preview trước commit batch.
3. Editor dùng chung, Zen/themes/font/stats/draft local/next number/price/publication/import preview, giữ chức năng cộng tác.
4. Studio ownership/API/list/create/edit/soft-delete/chapter; dashboard và menu tài khoản.
5. Chia xu 70% atomic; badge và phản hồi độc giả.
6. Lint, TypeScript, tests parser/ownership/unique/transaction/revenue/notification, build và kiểm tra trình duyệt.

## 4–6. Implementation, verification, report

Thay đổi tập trung ở `components/chapters`, `components/studio`, `app/studio`, API Admin/Studio/purchase/comments và `lib/server`. Không thay đổi dữ liệu truyện/chương hiện có để demo. Kiểm thử DB dùng transaction rollback hoặc database kiểm thử riêng. Skill React/composition/UI/LeanCTX đã đọc; `writing-plans` và `verification-before-completion` không có trong các thư mục skill đã tìm, dùng kế hoạch và bằng chứng lệnh thực tế thay thế.
