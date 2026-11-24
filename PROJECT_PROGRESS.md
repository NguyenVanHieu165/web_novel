# Web Novel - Project Progress

File này là nhật ký triển khai và checklist kỹ thuật của dự án. Trước khi bắt đầu một giai đoạn mới, đọc phần "Việc cần làm tiếp theo" và kiểm tra lại các điều kiện chưa hoàn thành. Sau mỗi giai đoạn, cập nhật trạng thái, danh sách file và kết quả kiểm tra.

## Quy ước trạng thái

- `[x]`: Đã hoàn thành và kiểm tra.
- `[ ]`: Chưa thực hiện.
- `[~]`: Đang thực hiện hoặc mới hoàn thành một phần.
- `[!]`: Đang bị chặn hoặc cần thao tác thủ công.

## Trạng thái tổng quan

| Giai đoạn | Phạm vi | Trạng thái |
| --- | --- | --- |
| P0 | Xác thực, phân quyền, toàn vẹn dữ liệu | `[~]` Hoàn thành mã nguồn; đã áp dụng migration trên `web_truyen` |
| P1 | Thể loại, tìm kiếm, điều hướng độc giả | `[x]` Hoàn thành & đã kiểm tra |
| P2 | Tài khoản, tủ sách, lịch sử đọc | `[x]` Đã có tủ sách, lịch sử đọc, cập nhật hồ sơ và đổi mật khẩu. |
| P3 | Paywall và ví xu | `[~]` Đã có mua chương VIP, ví xu, lịch sử giao dịch và nạp mô phỏng trong development. Còn kiểm tra E2E luồng mở khóa chương. |
| P4 | Bình luận, đánh giá, thông báo | `[~]` Đã hoàn thành bình luận, đánh giá, thông báo và kiểm tra tích hợp. |
| P5 | CMS và biên tập cộng tác nâng cao | `[~]` Đã có CMS, nhập/xuất Excel và Socket.IO/Yjs (chưa kiểm tra E2E trên trình duyệt). |
| P6 | Test, hiệu năng, SEO và vận hành | `[~]` Lint 0 lỗi/0 cảnh báo, TypeScript, 170/170 test và build Next.js đều qua. Còn E2E cho mua chương và biên tập cộng tác. |

---

## P0 - Xác thực, phân quyền và toàn vẹn dữ liệu

Ngày hoàn thành mã nguồn: 2026-11-19

### Nội dung đã hoàn thành

- [x] Tạo lớp xác thực server-side dùng chung.
- [x] JWT chỉ dùng để nhận diện phiên; trạng thái tài khoản và role được kiểm tra lại từ database.
- [x] Bảo vệ toàn bộ 29 Route Handler quản trị bằng quyền admin.
- [x] Chuẩn hóa response `401 UNAUTHENTICATED` và `403 FORBIDDEN`.
- [x] Chuyển `middleware.ts` sang `proxy.ts` theo Next.js 16.
- [x] Proxy bảo vệ cả trang `/admin/**` và API `/api/admin/**`.
- [x] Bắt buộc cấu hình `JWT_SECRET` và `INTERNAL_SECRET_TOKEN`.
- [x] API demo trả `404` trên production.
- [x] Socket.IO xác thực JWT tại handshake.
- [x] Chỉ admin được tham gia phòng thông báo và phòng biên tập chương.
- [x] Giới hạn payload Socket.IO và CRDT.
- [x] Hash mật khẩu tài khoản được tạo hoặc import từ CMS.
- [x] Tạo tài khoản, role `user` và ví xu trong transaction.
- [x] `/api/auth/me` lấy role mới nhất từ database và từ chối tài khoản đã xóa/khóa.
- [x] Thông báo được giới hạn theo đúng tài khoản admin đang đăng nhập.
- [x] Import Excel chỉ nhận `.xlsx`/`.xls`, tối đa 5 MB và 5.000 dòng.
- [x] Khai báo ràng buộc chống trùng số chương, slug chương và role tài khoản trong schema và migration.
- [x] Thêm file mẫu biến môi trường.
- [x] Loại thư mục build Socket.IO khỏi ESLint.
- [x] Sửa màu con trỏ cộng tác thành giá trị ổn định theo tài khoản.

### File mới

- `lib/server/auth-session.ts`
- `lib/server/spreadsheet-upload.ts`
- `proxy.ts`
- `socket-server/auth/socketAuth.ts`
- `.env.example`
- `prisma/migrations/20261119000000_add_data_integrity_constraints/migration.sql`
- `PROJECT_PROGRESS.md`

---

## 2026-11-21 — Crawler Truyện Đọc Việt: đã triển khai, nhập một phần do nguồn chặn

### Phạm vi và kết nối

- Thêm `scripts/crawl-truyendocviet.ts`; dùng Prisma Client hiện có trong `lib/prisma.ts`. Đã inspect schema/client bằng LeanCTX CLI và kiểm tra cả `DATABASE_NAME` lẫn `SELECT DATABASE()` là `web_truyen` trước khi ghi.
- Không sửa `prisma/schema.prisma`, không tạo migration, không thêm dependency. Hash schema và dữ liệu 28 truyện/354 chương có sẵn được đối chiếu với snapshot trước khi nhập: giữ nguyên.
- Khảo sát HTML `window.__INITIAL_DATA__`, bộ lọc công khai `/api/v1/books/filter` và mục lục POST `/api/v1/chapters/listByBook`. Parse JSON bằng Zod, không thực thi JavaScript của nguồn.
- Manifest đã gom **110 truyện độc nhất**, không trùng tên chuẩn hóa/slug với DB ban đầu: **15 truyện Full ưu tiên**, tổng cộng **94 Full / 16 đang ra**, chọn vòng qua 9 nhóm thể loại. Đây là số đã khám phá, không phải số nhập thành công.

### Cơ chế nhập

- Duyệt mục lục phân trang, kiểm tra thiếu/trùng số chương; chỉ lưu toàn văn công khai đúng ID truyện/chương. Bỏ qua VIP, khóa, yêu cầu đăng nhập và `GuestTeaser` (nội dung xem thử bị cắt). Nguồn có cấu hình khách tối đa 20 chương; chỉ áp dụng giới hạn này sau khi chính truyện trả về xem thử/khóa ở chương sau 20.
- Tối đa 5 request đồng thời, nghỉ ngẫu nhiên 150–350 ms, User-Agent trình duyệt, timeout 30 giây, retry có giới hạn và backoff chung tối thiểu 3 giây cho 429/503. Không gửi Cookie/Authorization.
- Khi nhận chuyển hướng `/security-check` hoặc chặn truy cập, lưu `source-stopped.json` và ngừng request mới; lần chạy lại giữ trạng thái dừng. Không vượt kiểm tra truy cập. Chỉ tiếp tục khi hạn chế của nguồn đã được giải quyết; không tự xóa marker.
- Manifest ghi atomic, khóa tiến trình, ánh xạ ID nguồn/DB bằng manifest và source tag. Resume chỉ đọc số chương đã có nội dung, không tải lại toàn bộ nội dung từ DB.
- Metadata ghi tuần tự, bộ nhớ đệm chuẩn hóa tên/slug cho thể loại và tác giả, kèm advisory lock cho crawler phối hợp. Tạo truyện/quan hệ trong transaction; lưu chương và nội dung trong `$transaction`, kiểm tra cả hai khóa UNIQUE, không ghi đè nội dung cũ.
- Dùng tiện ích chuẩn hóa tiếng Việt hiện có, làm sạch HTML/script/style/watermark, giữ đoạn văn. Ảnh bìa lưu tên hash URL trong `public/uploads/covers/`, qua file tạm + rename, tái sử dụng file đã tồn tại.

### Hai nấc chạy thực tế

```powershell
node --import ./socket-server/node_modules/tsx/dist/loader.mjs scripts/crawl-truyendocviet.ts --limit=3
node --import ./socket-server/node_modules/tsx/dist/loader.mjs scripts/crawl-truyendocviet.ts --limit=110
```

- Pilot tạo 3 metadata truyện Full và 3 ảnh bìa. Hầu Đại Lợi (ID 104) có 20 chương; Sậu Vũ Quá Thiên Sơn (ID 105) có 15 chương; Thiên Đường Tình Đầu Của Phòng Tư Kỳ (ID 106) chưa có chương do nguồn chặn.
- Nguồn trả HTTP 302 tới `/security-check`. Lần chạy `--limit=110` đã thực hiện và ghi log `[1/110]` đến `[110/110]`, nhưng giữ trạng thái dừng, không tải thêm 107 truyện còn lại. Tiến trình báo kết quả chưa hoàn tất; không tính log đã duyệt manifest là nhập thành công.
- Đánh dấu 3 chương cuối của mỗi truyện có đủ chương: hiện **2 truyện / 6 chương VIP nội bộ, giá 5 xu**. Chưa đạt mục tiêu 10 truyện VIP vì nguồn chặn.

| Chỉ số | Mới nhập từ nguồn này | Tổng DB sau chạy |
| --- | ---: | ---: |
| Truyện | 3 (đều Full; 2 truyện có chương) | 31 |
| Truyện đang ra mới | 0 | — |
| Thể loại | 7 | 72 |
| Tác giả | 3 | 69 |
| Chương thường | 29 | 335 |
| Chương VIP | 6 | 54 |
| Tổng chương | 35 | 389 |

### Xác minh

- Đối chiếu đầy đủ các hàng truyện/chương/nội dung trong snapshot ban đầu: **28 truyện và 354 chương cũ giữ nguyên 100%**.
- Không phát sinh trùng tên chuẩn hóa/slug ở thể loại và tác giả mới; không trùng cặp số chương/truyện hoặc slug chương/truyện.
- 3 ảnh bìa mới được giải mã kiểm tra thành công; văn bản mới đạt NFC, không còn HTML/script/style/watermark đã nhận diện. Quan hệ thể loại/tác giả của truyện mới đầy đủ.
- Kiểm tra rollback trên MySQL thật: tạo chương và nội dung trong transaction rồi chủ động rollback, tổng số chương không đổi.
- Trang đọc localhost trả HTTP 200 và HTML chứa nguyên văn nội dung chương mới đã nhập. Đây là kiểm tra HTTP/HTML, không phải kiểm tra ảnh chụp giao diện của lượt này.
- Báo cáo: `scripts/crawl-truyendocviet-results.json`; manifest, log, snapshot và bằng chứng kiểm tra: `node_modules/.cache/crawl-truyendocviet/`. Cache cần được giữ để resume và đối chiếu sau này.
- Mục tiêu **105–110 truyện và toàn bộ chương công khai chưa hoàn thành** do giới hạn truy cập từ nguồn; không khẳng định các truyện mang trạng thái Full đã được nhập đủ chương.
- Kiểm tra sau thay đổi cuối: `npm run lint` **Passed** (0 lỗi/cảnh báo), `npx tsc --noEmit` **Passed**, crawler mới + crawler cũ + chuẩn hóa tiếng Việt **25/25 Passed** (5 test crawler mới). Production build: **Not run**; lượt này chỉ thêm script/test/báo cáo, không sửa mã ứng dụng.

### File đã sửa

- `.gitignore`
- `eslint.config.mjs`
- `lib/auth.ts`
- `prisma/schema.prisma`
- `app/api/auth/me/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/admin/users/[id]/route.ts`
- `app/api/admin/users/import/route.ts`
- `app/api/admin/users/export/route.ts`
- `app/api/admin/genres/route.ts`
- `app/api/admin/genres/[id]/route.ts`
- `app/api/admin/genres/import/route.ts`
- `app/api/admin/genres/export/route.ts`
- `app/api/admin/stories/route.ts`
- `app/api/admin/stories/[id]/route.ts`
- `app/api/admin/stories/import/route.ts`
- `app/api/admin/stories/export/route.ts`
- `app/api/admin/chapter/route.ts`
- `app/api/admin/chapter/[id]/route.ts`
- `app/api/admin/chapter/import/route.ts`
- `app/api/admin/chapter/export/route.ts`
- `app/api/admin/notifications/route.ts`
- `app/api/admin/dashboard/overview/route.ts`
- `app/api/admin/dashboard/recent-users/route.ts`
- `app/api/statistics/route.ts`
- `app/api/demo/follow-notifications/route.ts`
- `socket-server/server.ts`
- `socket-server/handlers/collaborative.ts`
- `socket-server/handlers/notification.ts`
- `socket-server/package.json`
- `hooks/useCollaborativeEditor.ts`
- `components/admin/Sidebar.tsx`

### File đã thay thế

- `middleware.ts` đã được thay bằng `proxy.ts`.

### Kết quả kiểm tra

- [x] `npx prisma validate`
- [x] `npx prisma generate`
- [x] TypeScript cho ứng dụng Next.js.
- [x] TypeScript cho Socket server.
- [x] ESLint cho toàn bộ phạm vi P0.
- [x] `npm run build` production.
- [x] API quản trị trả `401` khi không có phiên đăng nhập.
- [x] API thống kê trả `401` khi không có phiên đăng nhập.
- [x] API demo trả `404` trên production.

### Kiểm tra trước migration (2026-11-21)

Ba ràng buộc `UNIQUE` trong `20261119000000_add_data_integrity_constraints/migration.sql` khớp với ba khai báo `@@unique` của model `VaiTroNguoiDung` và `Chuong`. Prisma CLI dùng `DATABASE_URL`, còn ứng dụng chọn database qua `DATABASE_NAME`. Truy vấn chỉ đọc xác nhận hai cấu hình trỏ tới hai database khác nhau trên cùng máy MySQL. Database CLI chưa có dữ liệu trong hai bảng liên quan. Database ứng dụng có 8 chương, 3 bản ghi gán vai trò và các xung đột sau.

| Ràng buộc | Khóa trùng trong database ứng dụng | ID chương |
| --- | --- | --- |
| `uk_tai_khoan_vai_tro` | 0 nhóm trùng tài khoản và vai trò | — |
| `uk_chuong_so_truyen` | Truyện 2, chương số 1.0 | 3, 10 |
| `uk_chuong_so_truyen` | Truyện 3, chương số 1.0 | 4, 6 |
| `uk_chuong_slug_truyen` | Truyện 22, slug `khoi-dau` | 1, 9 |

Truy vấn `information_schema` xác nhận cả ba index mới đều chưa có ở hai database. Database ứng dụng cũng chưa có bảng lịch sử `_prisma_migrations`. Đây là trạng thái trước khi xử lý.

### Kết quả migration trên `web_truyen` (2026-11-21)

- Sau khi được xác nhận, cập nhật trong một transaction: ID `10` đổi số chương `1.0` → `2.0`; ID `6` đổi số chương `1.0` → `1.1`; ID `9` đổi slug `khoi-dau` → `khoi-dau-2`. ID `1` giữ slug `khoi-dau`. Không xóa bản ghi.
- Trước và sau migration: giữ đủ 8 chương, 8 bản ghi nội dung và 3 bản ghi gán vai trò. Đối chiếu dữ liệu của sáu chương xác nhận nội dung, hai bản ghi tiến độ đọc và các trường ngoài phạm vi cập nhật không thay đổi. Truy vấn phát hiện trùng số chương, slug và gán vai trò đều trả 0 nhóm.
- `prisma migrate diff` xác nhận cấu trúc cũ khớp `20260618033143_increase_story_image_size`; đã đánh dấu migration này bằng `migrate resolve --applied`. `migrate deploy` áp dụng `20261119000000_add_data_integrity_constraints` và tạo đủ ba index `UNIQUE`.
- Khi thêm index ghép, MySQL bỏ index cũ `vai_tro_nguoi_dung.idTAI_KHOAN` dùng cho khóa ngoại. Đã khôi phục index cũ bằng `ALGORITHM=INPLACE, LOCK=NONE` để giữ cấu trúc khớp với Prisma; không sửa migration đã áp dụng.
- `migrate status` xác nhận cả hai migration đã được ghi nhận; `migrate diff` không phát hiện khác biệt; `prisma generate` thành công. Prisma Client truy vấn được khóa mới và API danh sách chương của truyện `2`, `3`, `22` trả `200` đúng thứ tự trên build production cục bộ.
- Kiểm tra cùng đợt: TypeScript và build Next.js đạt; 146/146 bài test không cần MySQL đạt. Hai nhóm test MySQL dùng database kiểm thử riêng không chạy lại trong đợt này. ESLint vẫn báo 38 lỗi và 17 cảnh báo.

### Xác minh lại migration trên `web_truyen` (2026-11-21)

- Kiểm tra cấu hình thực tế ở chế độ development và production. Cả hai chế độ Next.js và Prisma CLI đều nạp `.env`. Next.js kết nối tới `web_truyen` qua `DATABASE_NAME`. Prisma CLI lấy `mydb` từ `DATABASE_URL` nếu chạy với cấu hình mặc định.
- Kiểm tra lại sáu chương. Cả sáu đều có nội dung. Các ID `1`, `3`, `9`, `10` mỗi ID có một bản ghi tiến độ đọc. Sáu chương đều có 0 bản ghi lịch sử đọc, bình luận gắn với chương, quyền đã mua và giao dịch mua.
- Trên `web_truyen`, cả hai migration đã hoàn tất và đủ ba index `UNIQUE`. Ba truy vấn trùng đều trả 0 dòng. `migrate diff` xác nhận cấu trúc khớp Prisma schema.
- Chỉ định `web_truyen` cho tiến trình Prisma. `migrate deploy` xác nhận không còn migration chờ áp dụng và `prisma generate` tạo lại client thành công. Không thực hiện thao tác xóa hoặc cập nhật chương trong lượt xác minh này.
- Sau khi tạo lại Prisma Client, chạy toàn bộ suite với hai nhóm tích hợp MySQL. Kết quả 163/163 đạt, 0 lỗi, 0 bỏ qua.

### Quản lý phân quyền (2026-11-21)

- Đăng ký công khai và nhập Excel gán vai trò `user` cho tài khoản mới. CMS cho phép chọn vai trò hiện có khi tạo tài khoản. Tài khoản quản trị cần mật khẩu riêng trước khi được cấp quyền.
- Màn hình `/admin/permissions` hỗ trợ tìm tài khoản, lọc theo vai trò và cập nhật nhiều vai trò. Server kiểm tra quyền hiện tại và bảo vệ tài khoản quản trị đang dùng khi đổi quyền, khóa hoặc xóa.
- HTTP kiểm tra vai trò trong database. Socket.IO dùng `NEXT_PUBLIC_API_URL` để xác thực quyền quản trị lúc kết nối và kiểm tra lại mỗi 15 giây. Tài khoản mới được cấp quyền cần đăng nhập lại để nhận cookie phiên mới.
- Lint, TypeScript, build Next.js và build Socket.IO đã qua. Cả 183 bài test đạt khi bật tích hợp MySQL. Chrome kiểm tra cấp vai trò và lọc tài khoản. Kiểm tra Socket.IO xác nhận kết nối bị ngắt sau khi thu hồi quyền.

### Cấu hình khi vận hành

- [!] `.env` cục bộ vẫn trỏ Prisma CLI mặc định đến `mydb` qua `DATABASE_URL`, còn ứng dụng dùng `web_truyen` qua `DATABASE_NAME`. Đợt migration đặt `DATABASE_URL` chỉ cho tiến trình Prisma và kiểm tra đích là `web_truyen`; `mydb` không nhận migration mới. Lần chạy trên database ứng dụng tiếp theo cần đặt đúng đích và kiểm tra bằng `prisma migrate status` trước khi ghi.

- [!] Thêm `ADMIN_IMPORTED_USER_PASSWORD` vào `.env` trước khi tạo/import tài khoản từ CMS.
- [!] Đảm bảo Socket server nhận cùng `JWT_SECRET` với ứng dụng Next.js.
- [!] Cấu hình `INTERNAL_SECRET_TOKEN` độc lập cho giao tiếp nội bộ.

---

## P1 - Danh mục, tìm kiếm và điều hướng

Ngày hoàn thành mã nguồn: 2026-11-19

### Nội dung đã hoàn thành

- [x] Thống nhất URL chuẩn tiếng Việt cho thể loại: `/the-loai` (danh sách) và `/the-loai/[slug]` (chi tiết).
- [x] Tạo lớp query/service dùng chung cho danh sách truyện công khai (`lib/queries/story-list.query.ts`).
- [x] Thêm schema Zod query cho lọc, sắp xếp và phân trang (`schemas/story-query.schema.ts`).
- [x] Xây dựng trang danh sách thể loại (`app/(reader)/the-loai/page.tsx`).
- [x] Xây dựng trang chi tiết từng thể loại (`app/(reader)/the-loai/[slug]/page.tsx`).
- [x] Xây dựng trang truyện mới (`app/(reader)/truyen-moi/page.tsx`).
- [x] Xây dựng trang truyện hoàn thành (`app/(reader)/truyen-full/page.tsx`).
- [x] Xây dựng trang bảng xếp hạng (`app/(reader)/xep-hang/page.tsx`).
- [x] Xây dựng trang tìm kiếm nâng cao (`app/(reader)/tim-kiem/page.tsx`).
- [x] Đồng bộ bộ lọc vào URL query string hai chiều.
- [x] Thêm debounce 450ms và hủy timer tìm kiếm cũ trong `SearchInputBar.tsx`.
- [x] Sửa toàn bộ liên kết Header, Footer và trang chủ (`/the-loai`, `/truyen-moi`, `/truyen-full`, `/xep-hang`, `/tim-kiem`).
- [x] Bổ sung loading skeleton (`app/(reader)/loading.tsx`), empty state (`EmptyState.tsx`) và phân trang giữ nguyên query (`Pagination.tsx`).
- [x] Kiểm tra TypeScript (0 errors), Build Next.js (41/41 routes OK) và HTTP 200 cho toàn bộ reader routes.

### File mới

- `schemas/story-query.schema.ts`
- `lib/queries/genre.query.ts`
- `lib/queries/story-list.query.ts`
- `components/common/Pagination.tsx`
- `components/common/EmptyState.tsx`
- `components/story/StoryListFilter.tsx`
- `components/search/SearchInputBar.tsx`
- `components/search/SearchGenreChips.tsx`
- `app/(reader)/the-loai/page.tsx`
- `app/(reader)/the-loai/[slug]/page.tsx`
- `app/(reader)/truyen-moi/page.tsx`
- `app/(reader)/truyen-full/page.tsx`
- `app/(reader)/xep-hang/page.tsx`
- `app/(reader)/tim-kiem/page.tsx`
- `app/(reader)/loading.tsx`

### File đã sửa

- `lib/utils.ts` (Thêm hàm `slugify` tiếng Việt chuẩn SEO)
- `components/layout/Header.tsx` (Thống nhất link `/the-loai`, kết nối form tìm kiếm desktop/mobile sang `/tim-kiem?q=...`)
- `components/layout/Footer.tsx` (Đổi `/genres` sang `/the-loai`)
- `components/home/SmartGenreFilter.tsx` (Đổi link SectionHeader sang `/the-loai`)
- `components/home/HallOfFame.tsx` (Thêm link điều hướng "Xem đầy đủ" sang `/xep-hang`)
- `PROJECT_PROGRESS.md`

### Kết quả kiểm tra

- [x] `npx tsc --noEmit` hoàn thành với 0 lỗi (TypeScript sạch hoàn toàn).
- [x] `npm run build` production thành công trọn vẹn (41/41 routes, tĩnh & động).
- [x] Kiểm tra HTTP 200 OK cho:
  - `GET /the-loai` -> 200
  - `GET /the-loai/di-gioi` -> 200
  - `GET /truyen-moi` -> 200
  - `GET /truyen-full` -> 200
  - `GET /xep-hang` -> 200
  - `GET /tim-kiem?q=kiem` -> 200

---

## Nhật ký đối chiếu mã nguồn (2026-11-21)

### P2 - Tài khoản, tủ sách và lịch sử đọc

- Đã triển khai theo dõi và bỏ theo dõi truyện, trang `/tu-sach` và API tủ sách có phân trang.
- API `/api/chapters/[id]/progress` đọc và lưu tiến độ theo tài khoản. Trang `/lich-su`, `ReadingDock` và `ContinueReading` lấy dữ liệu từ `/api/reading-history`.
- Trang `/profile` hỗ trợ cập nhật tên hiển thị, ảnh đại diện qua URL HTTPS và đổi mật khẩu. Server xác thực mật khẩu cũ trước khi lưu mật khẩu mới đã băm. Header có lối vào hồ sơ và ví xu trên desktop và mobile.

### P3 - Paywall và ví xu

- Server kiểm tra quyền đọc trước khi truy vấn nội dung chương. Độc giả chưa có quyền đọc chương VIP thấy màn hình mở khóa.
- API `/api/chapters/[id]/purchase` mở khóa chương, trừ xu và ghi giao dịch trong cùng một transaction. Test MySQL kiểm tra yêu cầu đồng thời, chống trừ xu hai lần và hoàn tác khi ghi giao dịch thất bại.
- Trang `/vi-xu` đọc số dư và phân trang lịch sử giao dịch theo tài khoản đang đăng nhập. Nạp mô phỏng có ba gói 20, 50 và 100 xu, chỉ bật trong development. API khóa dòng ví và ghi biến động số dư trong cùng transaction.
- Hồ sơ và ví xu dùng giao diện thích ứng với màn hình nhỏ và cho phép chuyển sáng/tối. Chrome kiểm tra lưu hồ sơ, đổi mật khẩu, số dư riêng tư, phân trang và chuyển giao diện trên build production cục bộ. Trên bản development riêng, Chrome kiểm tra nạp 50 xu, cập nhật số dư và ghi đúng giao dịch trên database kiểm thử.
- `npm run lint`, `npx tsc --noEmit` và `npm run build` đều qua. Toàn bộ 170 bài test đạt khi bật cả hai cờ MySQL. Các test ví xu kiểm tra yêu cầu đồng thời, dữ liệu do client tự gửi, hoàn tác khi lỗi ghi giao dịch và việc tắt nạp mô phỏng trong production.

### P4 - Bình luận, đánh giá và thông báo

- Trang truyện có bình luận và đánh giá. Test MySQL kiểm tra lưu bình luận, giới hạn một đánh giá trên mỗi tài khoản và cập nhật điểm tổng hợp.
- Độc giả xem thông báo và đánh dấu đã đọc tại `/thong-bao`. Bộ test API thông báo dùng dữ liệu mô phỏng để kiểm tra phân quyền theo tài khoản và thao tác đánh dấu đã đọc.

### P5 - CMS và biên tập cộng tác

- CMS quản lý tài khoản, thể loại, truyện và chương. Các mục này hỗ trợ nhập và xuất Excel.
- Trình biên tập chương dùng Socket.IO và Yjs để đồng bộ nội dung. Build Socket.IO đã qua. Chưa kiểm tra luồng cộng tác từ đầu đến cuối (E2E) trên trình duyệt.

### P6 - Kết quả kiểm tra

- Chạy lại toàn bộ bộ test với cả hai nhóm tích hợp MySQL được bật. Kết quả 160/160 đạt, 0 lỗi và 0 bỏ qua. Các nhóm tích hợp tạo database kiểm thử riêng nên kết quả này độc lập với đợt áp dụng migration trên database ứng dụng.
- TypeScript, build Next.js production và build Socket.IO đã qua trong đợt rà soát.
- Trước đợt sửa lint bên dưới, ESLint báo 38 lỗi và 17 cảnh báo; kết quả này là mốc đối chiếu cũ.

### Hoàn tất sửa lint (2026-11-21)

- [x] `npm run lint`: 0 lỗi, 0 cảnh báo (trước đó 38 lỗi, 17 cảnh báo). Không thêm `eslint-disable`, `@ts-ignore` hoặc `any`.
- [x] `npx tsc --noEmit`: không có lỗi.
- [x] Toàn bộ suite với `RUN_MYSQL_PURCHASE_TESTS=1` và `RUN_MYSQL_SOCIAL_TESTS=1`: 163/163 đạt, 0 lỗi, 0 bỏ qua. Bao gồm đủ 160 test cũ và 3 test vòng đời mới; các test MySQL chỉ tạo/dọn database kiểm thử có tên ngẫu nhiên riêng.
- [x] `npm run build`: build Next.js production thành công, sinh đủ 47 trang.
- Thay các kiểu lỏng bằng kiểu Prisma/API chính xác hoặc `unknown` có kiểm tra kiểu; tách cập nhật state từ phản hồi bất đồng bộ khỏi effect đồng bộ; giữ thứ tự kéo thả cục bộ và reset khi nhận danh sách mới; chuyển ưu tiên demo và tên tác giả cộng tác sang thao tác người dùng.
- Bổ sung kiểm tra chống phản hồi cũ ghi đè truyện hoặc phiên đăng nhập sau refresh/logout; trạng thái loading kết thúc đúng khi đăng xuất. Đã tái hiện lỗi auth trước bản sửa và xác nhận kiểm tra hồi quy qua sau sửa.
- Xóa import không dùng, dùng `useWatch` cho ảnh xem trước và chuyển các ảnh bị cảnh báo sang `next/image` với `unoptimized` để giữ nguồn ảnh động hiện có. Không thêm dependency, không đổi schema/migration hoặc cấu hình ESLint.
- Rà soát diff so với snapshot đầu tác vụ; chưa chạy kiểm tra giao diện thủ công/E2E trên trình duyệt trong đợt này.

#### File sửa trong đợt lint

- `app/(reader)/xep-hang/page.tsx`
- `app/admin/dashboard/page.tsx`
- `app/admin/notifications/page.tsx`
- `app/admin/settings/page.tsx`
- `app/admin/stories/[id]/page.tsx`
- `app/admin/stories/page.tsx`
- `app/demo/follow/page.tsx`
- `check_db.js`
- `components/admin/Chart.tsx`
- `components/admin/Navbar.tsx`
- `components/admin/Sidebar.tsx`
- `components/admin/card.tsx`
- `components/chapters/ChapterForm.tsx`
- `components/chapters/ChapterTable.tsx`
- `components/genres/GenreForm.tsx`
- `components/home/CompletedStories.tsx`
- `components/home/GenreExplorer.tsx`
- `components/home/RecentlyUpdated.tsx`
- `components/home/UniverseShowcase.tsx`
- `components/home/story/HeroStoryCard.tsx`
- `components/layout/Footer.tsx`
- `components/stories/StoryCardList.tsx`
- `components/stories/StoryForm.tsx`
- `components/stories/StoryTable.tsx`
- `context/AuthContext.tsx`
- `hooks/useStory.ts`
- `lib/api.ts`
- `lib/mappers/story.mapper.ts`
- `PROJECT_PROGRESS.md`

#### File mới trong đợt lint

- `hooks/useReorderedItems.ts`
- `lib/admin-notification-types.ts`
- `tests/admin-state-lifecycle.test.mjs`

## Việc cần làm tiếp theo

- [x] Xây dựng giao diện hồ sơ và bảo mật tài khoản.
- [x] Xây dựng giao diện ví xu, nạp xu mô phỏng và lịch sử giao dịch.
- [x] Sửa toàn bộ 38 lỗi ESLint và 17 cảnh báo; bổ sung 3 test hồi quy vòng đời.
- [x] Xử lý ba nhóm chương trùng và áp dụng migration `20261119000000_add_data_integrity_constraints` trên `web_truyen`.
- [ ] Thêm dữ liệu mẫu chương VIP và test E2E trên trình duyệt cho luồng mở khóa chương và biên tập cộng tác.

---

## Checklist bắt đầu một giai đoạn mới

- [ ] Đọc `AGENTS.md` và tài liệu Next.js liên quan trong `node_modules/next/dist/docs/`.
- [ ] Đọc file này để xác định phần đã hoàn thành và các blocker.
- [ ] Chạy `git status --short` và bảo toàn thay đổi đang có.
- [ ] Xác định migration hoặc biến môi trường cần thiết.
- [ ] Chốt phạm vi và điều kiện hoàn thành của giai đoạn.

## Checklist kết thúc một giai đoạn

- [ ] Cập nhật trạng thái và ngày hoàn thành trong file này.
- [ ] Ghi rõ file mới, file sửa và migration mới.
- [ ] Ghi các thao tác thủ công hoặc rủi ro còn lại.
- [ ] Chạy TypeScript cho Next.js và Socket server.
- [ ] Chạy ESLint cho phạm vi thay đổi.
- [ ] Chạy production build.
- [ ] Kiểm tra các luồng chính bằng request hoặc trình duyệt.
- [ ] Cập nhật checklist của giai đoạn tiếp theo.

---

## 2026-11-21 — Thu thập lacatruyen.email: hoàn tất metadata, bị chặn nội dung chương

### Phạm vi và thực thi

- Tạo `scripts/crawl-stories.ts`; không cài dependency, không sửa schema hoặc tạo migration.
- Dùng LeanCTX CLI inspect schema và `lib/prisma.ts`. Tái sử dụng Prisma Client/adapter của ứng dụng; kiểm tra cả `DATABASE_NAME` và `SELECT DATABASE()` phải là `web_truyen` trước khi ghi.
- Đã chạy thực tế `--limit=2`, sau đó `--limit=50`, chạy lại `--limit=50` để phục hồi một lỗi mạng và chạy lại `--limit=2` để kiểm tra idempotency.
- 50 URL độc nhất được chọn xen kẽ từ các API công khai `new-updates`, `free`, `hidden-gems` (editor/gems), `top-view-weeks`, `top-view-months`. 24 truyện hoàn thành, 26 truyện đang tiến hành.
- Nạp đủ tiêu đề, văn án, tác giả/nhóm đăng theo thông tin nguồn, thể loại, trạng thái, lượt xem và ảnh bìa. Nguồn không công bố điểm đánh giá trong payload chi tiết; không biến action_score thành điểm sao. Điểm đánh giá trong ứng dụng được tính từ đánh giá mẫu, payload nguồn được giữ riêng ở cache.
- Giải mã URL Next Image, tải 50 ảnh gốc về `public/uploads/covers/`; tổng 11.847.358 bytes. Sharp xác nhận giải mã được cả 50 ảnh; đối chiếu SHA-256 và mtime xác nhận chạy lại không tải đè.

### Số liệu đối chiếu database

| Dữ liệu | Thêm mới trong lượt này | Thuộc 50 truyện | Tổng web_truyen sau chạy |
| --- | ---: | ---: | ---: |
| Thể loại | 50 | 59 | 65 |
| Tác giả/nhóm đăng | 66 | 66 | 66 |
| Truyện | 50 | 50 | 76 |
| Chương thường | 0 | 0 | 5 |
| Chương VIP | 0 | 0 | 3 |
| Bình luận | 10 | 10 | 13 |
| Đánh giá | 10 | 10 | 10 |

59 thể loại liên kết gồm 9 thể loại đã có sẵn; 50 thể loại được tạo mới. Các chương thường/VIP trong tổng DB đã tồn tại trước đợt crawl.

### Resume và dữ liệu mẫu

- Manifest cố định, lock tiến trình, ảnh ghi qua file tạm + rename, tái dùng story slug, tuần tự hóa transaction metadata vì tên thể loại/tác giả chưa có UNIQUE.
- Tối đa 3 worker và delay ngẫu nhiên 400–800ms mỗi request; timeout 30 giây; tôn trọng Retry-After có giới hạn khi HTTP 429/503, ghi rõ lỗi từng truyện/chương.
- Nhánh nội dung chỉ nhận văn bản công khai đầy đủ, loại script/style/quảng cáo/watermark, chuẩn hóa đoạn văn. Số chương và slug được phân biệt theo truyện; chương + nội dung ghi chung `$transaction`. Không nhập chương về sau như chương đầu nếu nguồn chỉ công bố chương muộn.
- Đã tạo 10 bình luận và 10 đánh giá từ tài khoản active hiện có, có nhãn `[Dữ liệu mẫu crawl-stories]`; không ghi đè đánh giá thật. Aggregate điểm sao được cập nhật cùng transaction.
- Chỉ đánh VIP (3 chương cuối phần đã tải, giá 5 xu, 10 truyện đầu) khi thực sự có ít nhất 10 chương có nội dung. Nhánh này chưa được chạy thành công do chặn ở nguồn.
- Lần resume 2 truyện có delta bằng 0 cho toàn bộ 7 loại dữ liệu; không có trùng cặp `(idTruyen, chuongSo)` hoặc `(idTruyen, slug)` trong DB.
- Báo cáo review được lưu tại `scripts/crawl-stories-results.json`. Manifest và payload metadata nguồn tại `node_modules/.cache/crawl-stories/`; cache có thể mất khi xóa node_modules, cần giữ lại khi muốn tiếp nối chính xác danh sách này.

### Xác minh

- ESLint phạm vi script/test: Passed.
- TypeScript `npx tsc --noEmit`: Passed.
- Tests `node --import ./socket-server/node_modules/tsx/dist/loader.mjs --test tests/crawl-stories.test.mjs`: Passed, 5/5.
- Kiểm tra DB/ảnh/resume thực tế: Passed cho metadata, quan hệ, ảnh, không tạo trùng.
- Production build: Not run (thay đổi script ngoài luồng ứng dụng).
- Không chạy lại đợt rà soát tổng thể hoặc toàn bộ suite 185 tests.

### Chưa hoàn thành — nguồn yêu cầu đăng nhập

**Cả 50/50 truyện đều trả `notify: not_login` và `lock: login` hoặc `lock: all` khi đọc chương, kể cả truyện trong mục free.** Payload nội dung trả chuỗi mã hóa ngắn, không có toàn văn cho khách. Một số `firstChapter` còn trỏ tới chương muộn (775, 853, 1706, ...).

Do đó chưa nạp được 10–15 chương đầu/truyện, chưa tạo VIP mới và chưa thể xác nhận paywall bằng bộ dữ liệu crawl. Script kết thúc với trạng thái lỗi/chưa đủ dữ liệu thay vì báo thành công toàn bộ. Cần quyền truy cập hợp lệ và nguồn cung cấp toàn văn/chương đầu; không tạo chương rỗng hoặc nội dung giả để đủ số. Chưa có xác minh transaction chương trên dữ liệu thật trong lượt này; các test mới chỉ xác minh bộ làm sạch/parser và từ chối dữ liệu bị khóa.

Lệnh chạy lại từ thư mục dự án:

```powershell
node --import ./socket-server/node_modules/tsx/dist/loader.mjs scripts/crawl-stories.ts --limit=50
```

---

## 2026-11-21 — Bổ sung chương bằng phiên đăng nhập: 346 chương, dừng do nguồn chuyển `/banned`

### Thay đổi

- Cập nhật `scripts/crawl-stories.ts` để đọc `CRAWL_SOURCE_COOKIE` và `CRAWL_SOURCE_TOKEN` trong `.env`, gửi Cookie + Authorization cho API danh sách và trang chương thuộc đúng origin `https://lacatruyen.email`. Không gửi credential sang host khác, không tự theo redirect, không log/lưu credential vào báo cáo.
- Dùng nguyên manifest 50 truyện và cache nguồn; chỉ tìm truyện đã tồn tại trong `web_truyen`. Không tạo truyện, không tải ảnh, không thay đổi bình luận/đánh giá, không sửa schema/migration và không cài dependency.
- Thêm `scripts/crawl-source-codec.ts`: triển khai định dạng phản hồi của browser client bằng Node crypto có sẵn. Chỉ đọc nội dung sau khi nguồn trả `notify: success`; bỏ qua riêng chương `lock: all`/có phí và tiếp tục các chương khác. Không mua chương hoặc gọi endpoint mở khóa nguồn.
- Lấy danh sách qua `/api/chapters/list-chapters`, `page=1`, `items_per_page=15`, `order=ASC`. Đã sửa trường hợp `chapter_order` lệch (775...) nhưng tiêu đề là Chương 1: sắp xếp/lưu theo số chương trong tiêu đề, đối chiếu đồng thời source story ID, chapter ID, slug và source order.
- Chương + nội dung được lưu chung Prisma `$transaction`; kiểm tra cả UNIQUE số chương và slug trong cùng truyện. Bỏ qua trước request khi chương đã có nội dung; giới hạn 3 worker, delay 400–800ms/request. Dùng IPv4 trước sau khi quan sát lỗi kết nối IPv6.
- Làm sạch HTML/quảng cáo/script/style/watermark; lưu văn bản thuần với ngắt đoạn. Nội dung đã tải dài 6.328–33.754 ký tự/chương.
- Gán 3 chương cuối phần đã nạp của 10 truyện đầu đủ >=10 chương là VIP giá 5 xu, chọn theo thứ tự manifest thay vì thứ tự worker hoàn thành.

### Chạy thực tế và kết quả

1. `--limit=2`: Passed, 2 truyện x 15 chương = 30 chương; 24 thường, 6 VIP. DB xác nhận nội dung không chứa HTML/script/quảng cáo.
2. `--limit=50`: đã khởi chạy và ghi tiếp dữ liệu thật. Giữa lượt, nhiều trang chương bắt đầu báo fetch failed; kiểm tra bằng redirect manual xác định HTTP 307 về `/banned`. Đã dừng tiến trình crawler đang sở hữu ngay khi xác định trở ngại. Không hoàn tất lượt tải 50 truyện.
3. Bổ sung phát hiện redirect `/banned`, `/login`, `/auth`, redirect khác origin và HTTP 401/403: dừng request mới, lưu marker `node_modules/.cache/crawl-stories/source-stopped.json`. Lần chạy sau cũng dừng trước request nếu marker còn tồn tại.
4. `--limit=50 --finalize-local`: chỉ đọc dữ liệu local/DB, hoàn tất fixture VIP cho 10 truyện đủ chương và ghi báo cáo phần dữ liệu đã nạp; không gọi nguồn. Đã chạy lại chế độ local để xác minh delta=0.

| Dữ liệu | Thêm mới trong đợt bổ sung chương | Tổng web_truyen |
| --- | ---: | ---: |
| Chương thường | 316 | 321 |
| Chương VIP (5 xu) | 30 | 33 |
| Tổng chương | 346 | 354 |

Trong 50 truyện: 21 truyện có đủ 15 chương, 1 truyện có 14 chương, 1 truyện có 13 chương, 1 truyện có 4 chương, 26 truyện chưa có chương. Tổng 23/50 truyện đạt mục tiêu 10–15 chương; 27/50 chưa đạt. Không coi dữ liệu một phần là hoàn tất toàn bộ.

### Xác minh và bảo toàn dữ liệu

- LeanCTX CLI inspect schema, Prisma Client và script trước khi sửa. Kiểm tra `DATABASE_NAME` + `SELECT DATABASE()` xác nhận `web_truyen`.
- ESLint 3 file script/codec/test: Passed, 0 lỗi/cảnh báo.
- TypeScript `npx tsc --noEmit`: Passed.
- `tests/crawl-stories.test.mjs`: Passed, 11/11 (header đúng origin, redaction, số chương lệch, giải mã phản hồi hợp lệ, từ chối lock/paid/redirect, transaction rollback harness).
- Test hiện có cho chapter list + purchase: Passed, 24/24. Không chạy lại toàn bộ suite.
- HTTP ứng dụng tại localhost:3000: chương 1 Vạn Cổ Thần Đế trả 200 và chứa văn bản đã lưu; chương 15 VIP trả 200 nhưng không lộ toàn văn cho khách. Chưa thực hiện mua VIP bằng tài khoản qua trình duyệt.
- Đối chiếu trước/sau: 50 truyện, thông tin nội dung truyện/quan hệ, 50 ảnh (SHA-256 và mtime), 10 bình luận và 10 đánh giá đã nạp được giữ nguyên. Lượt xem Vạn Cổ Thần Đế và Thanh Sơn quan sát tăng 1 trong lúc ứng dụng đang hoạt động; crawler không ghi trường lượt xem.
- SHA-256 schema không thay đổi trong đợt này; không tạo migration. Không có trùng `(idTruyen, chuongSo)` hoặc `(idTruyen, slug)`; các chương đã nạp bắt đầu từ 1 và liên tục theo từng truyện. `soChuong` khớp dữ liệu thực tế.
- Resume local: delta=0 ở toàn bộ bảng thống kê; giữ nguyên ID và nội dung 346 chương. Không phát hiện credential nguồn trong các script/test/báo cáo thay đổi.
- Production build: Not run (chỉ thay đổi script ngoài runtime ứng dụng).

### File thay đổi

- `scripts/crawl-stories.ts`
- `scripts/crawl-source-codec.ts` (mới)
- `tests/crawl-stories.test.mjs`
- `scripts/crawl-stories-chapters-results.json` (báo cáo mới; không chứa credential hoặc toàn văn)
- `PROJECT_PROGRESS.md`

### Trở ngại còn lại

Nguồn đã chuyển trang chương sang `/banned`; chưa xác định đây là hạn chế tài khoản hay cơ chế chống thu thập của nguồn. Cần khôi phục quyền truy cập hợp lệ trước khi tải tiếp 27 truyện chưa đạt yêu cầu. Không đổi token/IP, bỏ cookie hoặc dùng đường khác để né hạn chế. Marker dừng cần được giữ trong lúc nguồn chưa cho phép truy cập lại. Bản sửa xử lý offset chapter_order đã có test, nhưng chưa chạy lại nguồn cho các truyện bị bỏ qua bởi bản trước vì lượt tải đã phải dừng.

Lệnh tổng kết local (không gọi nguồn; exit code khác 0 khi còn truyện chưa đủ chương):

```powershell
node --import ./socket-server/node_modules/tsx/dist/loader.mjs scripts/crawl-stories.ts --limit=50 --finalize-local
```

Báo cáo pilot nằm trong `node_modules/.cache/crawl-stories/chapters-report-2.json`; báo cáo phục hồi local nằm trong `chapters-local-report-50.json`; báo cáo review cuối cùng tại `scripts/crawl-stories-chapters-results.json`.

---

## 2026-11-21 — Duyệt toàn bộ mục lục công khai của 50 truyện và chuẩn hóa Unicode

### Thực thi và kết quả thực tế

Đã chạy thành công:

```powershell
node --import ./socket-server/node_modules/tsx/dist/loader.mjs scripts/crawl-stories.ts --limit=50 --all-chapters
```

- Duyệt đủ **50/50 truyện**, **59.419 mục chương**, **141 trang mục lục có dữ liệu**. Tiếp tục phân trang cho tới trang rỗng; không dừng chỉ vì trang ngắn hơn 500 mục. Metadata mục lục được lưu dưới `node_modules/.cache/crawl-stories/public-catalogue/`.
- Bỏ qua **346 chương đã có** trước khi tải nội dung; bỏ qua **59.073 chương thuộc truyện khóa login/all**; **0 chương mới** vì nguồn không cung cấp toàn văn cho khách trong 50 truyện này.
- Quy tắc khóa được xác minh từ `story.lock` trong phản hồi chương: đây là khóa cấp truyện. Sau khi xác định login/all cho một truyện, tiếp tục duyệt toàn bộ mục lục nhưng không gửi thêm request nội dung chịu cùng quy tắc khóa. Không khẳng định đã mở từng trang trong 59.073 chương bị khóa.
- Chế độ khách không gặp `/banned`, không gửi Cookie/Authorization. Không sửa/xóa marker dừng phiên đăng nhập cũ; marker của chế độ công khai được tách riêng và vẫn dừng nếu chính nguồn công khai trả `/banned`.
- Hoàn tất fixture: **15 truyện trong manifest có 3 chương cuối đã lưu là VIP, giá 5 xu**. Chuyển thêm 15 chương thường có sẵn sang VIP; không tạo chương giả và không thay đổi 30 VIP của đợt trước.

| Dữ liệu | Trong 50 truyện manifest | Toàn bộ web_truyen |
| --- | ---: | ---: |
| Truyện | 50 | 76 |
| Chương thường | 301 | 306 |
| Chương VIP | 45 | 48 |
| Tổng chương | 346 | 354 |

### Cập nhật script

- `--all-chapters` chọn chế độ khách, không đọc credential để gắn header. Có tối đa 5 worker gửi request, delay ngẫu nhiên 150–350ms; luân phiên User-Agent Chrome/Edge. Không sử dụng proxy hoặc thay đổi IP.
- API mục lục sử dụng page tăng dần, yêu cầu 500 mục/trang và duyệt tới trang rỗng. Kiểm tra lặp trang để báo mục lục chưa đầy đủ thay vì lặp vô hạn hoặc báo thành công giả.
- HTTP 429/503 áp dụng cooldown chung ít nhất 3 giây, tôn trọng Retry-After nếu dài hơn, thử lại tối đa 3 lần. HTTP 401/403 hoặc yêu cầu đăng nhập được bỏ qua trong chế độ khách; `/banned` vẫn làm dừng nguồn. Backoff được test chính sách; lượt thực tế không quan sát thấy HTTP 429.
- Chỉ lưu toàn văn công khai hợp lệ sau khi kiểm tra khóa/phí và identity truyện/chương. Giữ transaction cho Chuong + NoiDungChuong và cả hai ràng buộc UNIQUE. Không tạo truyện, không tải lại ảnh, không sửa schema/migration hoặc cài dependency.
- Unicode NFC được áp dụng ở codec, bộ làm sạch, tiêu đề chương và tên truyện nguồn. Thêm sửa dấu sắc khoảng cách U+00B4/U+02CA ngay sau nguyên âm tiếng Việt trước khi NFC: `trô´ng` thành `trống`; giữ dấu đứng riêng. NFC đơn thuần không sửa được U+00B4.
- Đã quét toàn bộ **76 truyện và 354 chương cũ** để chuẩn hóa tên truyện/văn án/tag, tiêu đề và nội dung chương. Sửa thực tế **2 bản nội dung**, không cần sửa tên/tiêu đề. Không thay đổi slug, ID, đường dẫn ảnh hoặc quan hệ.

### Xác minh

- ESLint phạm vi script/codec/test: Passed, 0 lỗi/cảnh báo.
- TypeScript `npx tsc --noEmit`: Passed.
- Tests crawler + chapter list + paywall: Passed, **40/40** (16 crawler và 24 test hiện có).
- Production build: Not run (chỉ thay đổi script ngoài runtime ứng dụng).
- Đối chiếu snapshot trước/sau: giữ nguyên ID và slug của toàn bộ 354 chương cũ; văn bản sau đúng bằng bản gốc qua hàm chuẩn hóa, không mất nội dung. Toàn bộ tên truyện, tiêu đề và nội dung DB đúng NFC.
- Chạy lại riêng chuẩn hóa: 0 truyện, 0 tiêu đề, 0 nội dung cần sửa; xác nhận idempotent.
- Bảo toàn 50 ảnh bằng SHA-256 và mtime, giữ nguyên bình luận/đánh giá, quan hệ và hash schema. Không có trùng số chương/slug theo truyện. Đã xác minh 3 chương cuối của đủ 15 truyện đều là VIP giá 5 xu.
- Không có nội dung đăng nhập/token trong báo cáo công khai. Báo cáo phân biệt rõ mục lục đã duyệt và toàn văn chưa được nguồn cấp cho khách; không coi 59.419 mục lục là 59.419 chương đã nhập DB.

### File thay đổi

- `scripts/crawl-stories.ts`
- `scripts/crawl-source-codec.ts`
- `tests/crawl-stories.test.mjs`
- `scripts/crawl-stories-public-results.json` (báo cáo mới)
- `PROJECT_PROGRESS.md`

Không thể bảo đảm concurrency/delay/User-Agent sẽ tránh chặn trong mọi lần chạy. Với dữ liệu nguồn hiện tại, tăng tốc hoặc lặp lại chế độ khách không giúp lấy được toàn văn đang yêu cầu đăng nhập.

---

## 2026-11-21 — Xóa toàn bộ truyện 0 chương trong web_truyen

### Kết quả thực thi

Đã tạo và chạy `scripts/prune-empty-stories.ts`:

```powershell
node --import ./socket-server/node_modules/tsx/dist/loader.mjs scripts/prune-empty-stories.ts --dry-run
node --import ./socket-server/node_modules/tsx/dist/loader.mjs scripts/prune-empty-stories.ts
```

Dry-run liệt kê đầy đủ ID, tiêu đề, slug, ảnh bìa của **48 truyện thực sự không có bản ghi Chuong** (26 truyện crawl và 22 truyện mẫu cũ). Không sử dụng trường đếm `soChuong`, không coi chương bị ẩn/xóa mềm là không tồn tại.

| Hạng mục | Kết quả |
| --- | ---: |
| Truyện 0 chương đã xóa | 48 |
| Ảnh bìa không còn tham chiếu đã dọn | 26 |
| Truyện 0 chương còn lại | 0 |
| Tổng truyện còn lại | 28 |
| Chương thường còn lại | 306 |
| Chương VIP còn lại | 48 |
| Tổng chương còn lại | 354 |

Đã xóa các liên kết/phụ thuộc của đúng 48 truyện: 148 liên kết thể loại, 35 liên kết tác giả, 1 bình luận, 1 đánh giá và 7 theo dõi. Không có tập/lượt thích/lịch sử đọc cần xóa trong tập dữ liệu này. Giữ nguyên các bản ghi thể loại và tác giả gốc dùng chung.

### Cơ chế an toàn

- Dùng LeanCTX CLI inspect các model Truyen/Chuong/Quyen/BinhLuan/LikeBinhLuan và những quan hệ liên quan. Đối chiếu FK thật bằng information_schema trước khi thực thi.
- Tái sử dụng Prisma Client của `lib/prisma.ts`; kiểm tra `DATABASE_NAME` và `SELECT DATABASE()` đều phải là `web_truyen` trước khi ghi.
- Mỗi truyện dùng một `$transaction` Repeatable Read. Khóa hàng cha bằng `SELECT ... FOR UPDATE`, kiểm tra lại `chuong: { none: {} }` sau khi khóa và trên lệnh DELETE cuối. Không có lệnh xóa chương/nội dung chương.
- Xóa lượt thích trước bình luận, xóa những liên kết/phụ thuộc theo FK trước bản ghi Truyen. Lỗi bất kỳ làm rollback transaction của truyện đó. Từ chối thao tác nếu tập/bình luận của truyện rỗng liên kết nhầm tới chương của truyện khác.
- Chỉ dọn file tương ứng ảnh bìa/thumbnail của truyện đã xóa thành công, nằm trực tiếp trong `public/uploads/covers/`. Kiểm tra lại cả ảnh bìa và thumbnail của mọi truyện còn lại, bao gồm alias Next Image. Không xóa ảnh dùng chung, ảnh remote, đường dẫn thoát thư mục hoặc symlink.
- Đã sao lưu dữ liệu ứng viên/phụ thuộc, snapshot đầy đủ dữ liệu cần bảo toàn và 26 file ảnh trước khi xóa. Không sửa schema hoặc tạo migration, không cài dependency mới, không sửa script crawl/manifest.
- Không cần tính lại điểm đánh giá của truyện còn lại: không xóa hay chỉnh sửa bất kỳ đánh giá nào của chúng.

### Xác minh

- Dry-run trước xóa: 48 ứng viên. Dry-run sau xóa: **0 ứng viên**.
- Smoke test rollback trên MySQL thật: xóa thử trong transaction rồi chủ động throw; truyện và 6 liên kết thể loại được khôi phục nguyên vẹn.
- So sánh fingerprint snapshot trước/sau: toàn bộ **28 truyện có chương**, **354 chương**, nội dung, trạng thái VIP/giá và các quan hệ của chúng không thay đổi; gồm đầy đủ 346 chương crawl.
- 24 ảnh bìa được giữ lại có SHA-256 không đổi. Xác minh 26 file đã dọn không còn trong thư mục public và bản sao backup khớp hash trước xóa. Kiểm tra thực tế guard ảnh dùng chung: file còn được tham chiếu bị bỏ qua.
- Hash schema giữ nguyên trong đợt này; các thay đổi schema có sẵn của người dùng không bị đụng tới.
- ESLint script/test: Passed.
- TypeScript `npx tsc --noEmit`: Passed.
- Tests `tests/prune-empty-stories.test.mjs`: Passed, **7/7**.
- Production build: Not run (script bảo trì dữ liệu ngoài runtime ứng dụng).

### File và báo cáo

- `scripts/prune-empty-stories.ts` (mới)
- `tests/prune-empty-stories.test.mjs` (mới)
- `scripts/prune-empty-stories-results.json` (báo cáo kết quả)
- `PROJECT_PROGRESS.md`
- Backup thực thi: `node_modules/.cache/prune-empty-stories/2026-11-21T14-40-27-338Z-execute/` (before.json, deletions.json, report.json, covers-backup/).
- Danh sách dry-run ban đầu: `node_modules/.cache/prune-empty-stories/2026-11-21T14-39-35-169Z-preview/preview.json`.

Manifest crawl cũ vẫn giữ 50 URL để đối chiếu lịch sử; 26 URL trong đó tương ứng truyện rỗng đã bị xóa. Crawler hiện có chủ động từ chối tạo lại truyện thiếu trong DB. Backup đặt trong cache node_modules; cần giữ thư mục backup nếu muốn bảo toàn khả năng khôi phục sau khi dọn node_modules.

---

## 2026-11-21 — Chuẩn hóa dấu tiếng Việt dùng chung và nâng cấp font trang đọc

### Điều tra dữ liệu thực tế

- Kiểm tra `DATABASE_NAME` và `SELECT DATABASE()` xác nhận đúng `web_truyen`; đọc thông tin kết nối Prisma hiện có qua LeanCTX.
- Quét toàn bộ 354 nội dung đang có: tại thời điểm bắt đầu lượt này, không thấy U+00B4/U+0060/U+02C6/U+02DC/U+02CA/U+02CB hay dấu tổ hợp U+0300–U+036F còn tách rời trong dữ liệu.
- Bản mẫu `NoiDungChuong.idNoiDungChuong=9`, `idChuong=11` có các từ đúng Unicode:
  - `thiết`: U+0074 U+0068 U+0069 U+1EBF U+0074.
  - `luồng`: U+006C U+0075 U+1ED3 U+006E U+0067.
  - `Hắn`: U+0048 U+1EAF U+006E.
- HTML trả từ localhost cũng chứa các từ đúng. Vì vậy không khẳng định tìm thấy dấu lỗi trong DB ở lượt này hoặc đã sửa thêm bản ghi khi thực tế không có thay đổi.

### Thay đổi

- Thêm `lib/vietnamese-text.ts` làm triển khai chuẩn hóa thuần dùng chung, export `normalizeVietnameseText()` qua `lib/utils.ts`. Codec crawl dùng chính hàm này và giữ alias `normalizeVietnamese` tương thích các script cũ, không sao chép logic.
- Ánh xạ các dấu khoảng cách dính sau nguyên âm về dấu tổ hợp: sắc U+00B4/U+02CA, huyền U+0060/U+02CB, mũ U+02C6, ngã U+02DC và dấu trăng U+02D8. Sắp dấu tạo hình nguyên âm trước dấu thanh, gộp dấu trùng và kết thúc bằng NFC. Không xóa dấu không nhận diện hoặc dấu xung đột một cách âm thầm; dấu câu đứng riêng được giữ nguyên.
- Bổ sung test các ví dụ `thiê´t`, `đê´n`, `luô`ng`, `Hă´n nă´m chặt nă´m đâ´m`, NFD, dấu sai thứ tự, toàn bộ nguyên âm tiếng Việt có dấu ở chữ hoa/thường, idempotency và render an toàn.
- `ChapterText` gọi chuẩn hóa ngay trước tách đoạn và render. Giữ component memo hóa, tiếp tục escape HTML qua React, không dùng dangerouslySetInnerHTML.
- Khai báo Inter và Noto Serif bằng `next/font/google`, subsets latin + vietnamese, display swap. Font variables ở layout gốc để vùng đọc và phần xem trước trong portal cài đặt cùng nhận được font; không đổi font mặc định của toàn bộ giao diện.
- Hai chế độ đọc dùng Inter (Không chân) và Noto Serif (Có chân), thay chuỗi Georgia/Times New Roman. Phần xem trước tái dùng đúng font từ reader settings.

### Cập nhật/đối chiếu DB

Đã chạy:

```powershell
node --import ./socket-server/node_modules/tsx/dist/loader.mjs scripts/normalize-vietnamese-text.ts
```

- Script sao lưu trước khi chuẩn hóa, duyệt toàn bộ 28 truyện và 354 chương hiện có theo batch; chuẩn hóa tên truyện/văn án/tag, tiêu đề và nội dung qua transaction hiện có.
- Số bản ghi cần cập nhật thực tế trong lượt này: **0 truyện, 0 tiêu đề chương, 0 nội dung chương** vì dữ liệu đã đúng chuẩn. Không thực hiện ghi lại không cần thiết.
- Truy vấn SQL REGEXP kiểm tra riêng nội dung chương, tiêu đề chương và các trường văn bản truyện: **0 / 0 / 0 bản ghi còn dấu tách rời**.
- Giữ nguyên ID, slug, quan hệ truyện/chương, giá/VIP, tổng số bản ghi và hash schema. Không tạo migration hoặc thêm dependency.
- Báo cáo tại `scripts/normalize-vietnamese-results.json`; backup trong `node_modules/.cache/normalize-vietnamese/`.

### Xác minh giao diện và kiểm tra bắt buộc

- Đã mở và tải lại chương mẫu trên localhost:3000 bằng trình duyệt. DOM chứa `thiết`, `luồng`, `Hắn` với code point dựng sẵn và có 0 dấu tách rời.
- Computed font của vùng reader-content là Inter; chọn Có chân xác nhận Noto Serif; sau kiểm tra trả lại lựa chọn Không chân ban đầu.
- Đã quan sát ảnh chụp các dòng chứa `luồng` và `thiết`; nét dấu hiển thị đúng. Ảnh lưu tại `node_modules/.cache/normalize-vietnamese/reader-inter.jpg` và `reader-thiet.jpg`.
- `npm run lint`: Passed, toàn dự án 0 lỗi/cảnh báo.
- `npx tsc --noEmit`: Passed.
- Tests crawler + normalizer/render + reader settings: Passed, **35/35**, trong đó `tests/crawl-stories.test.mjs` **16/16**.
- Production build: Not run; trang dev đã biên dịch và phục vụ font/trang đọc thành công.

### File thay đổi

- `lib/vietnamese-text.ts` (mới)
- `lib/utils.ts` (export tiện ích; giữ thay đổi slugify có sẵn)
- `scripts/crawl-source-codec.ts`
- `scripts/normalize-vietnamese-text.ts` (mới)
- `scripts/normalize-vietnamese-results.json` (mới)
- `components/chapter/ChapterText.tsx`
- `components/chapter/ReaderSettingsPanel.tsx`
- `lib/reader-settings.ts`
- `app/layout.tsx` (thêm font variables; giữ các thay đổi ThemeProvider/lang có sẵn)
- `tests/vietnamese-text.test.mjs` (mới)
- `tests/reader-settings.test.mjs`
- `PROJECT_PROGRESS.md`

## 2026-11-21 — Dừng crawler LoHi theo yêu cầu người dùng

- Đã dừng thu thập; kiểm tra không còn tiến trình `scripts/crawl-lohi.ts` chạy. Không gửi thêm request nguồn trong bước dừng.
- Truy vấn `SELECT DATABASE()` xác nhận đúng `web_truyen`.
- Số liệu thực tế khi dừng: LoHi đã thêm **46 truyện, 2.104 chương** (2.095 chương thường, 9 chương VIP nội bộ).
- Tổng database: **77 truyện, 2.493 chương** (2.430 chương thường, 63 chương VIP).
- Manifest và cache giữ nguyên để đối chiếu. Chưa hoàn tất mọi mục lục và chưa nâng VIP lên 10 bộ; người dùng xác nhận dữ liệu đã đủ và yêu cầu dừng.
- Báo cáo số liệu dừng: `scripts/crawl-lohi-results.json`. Không sửa schema, không tạo migration trong lượt này.

## 2026-11-21 — Import từ URL trong Quản lý truyện

### Phase 1–3: Hiểu, phân tích, lập kế hoạch

- Inspect bằng LeanCTX CLI schema, Prisma Client, trang Admin, components/stories, utils và giao thức crawler hiện có. Không có LeanCTX MCP trong phiên; CLI không hỗ trợ tree nên dùng signatures/range và danh sách file có mục tiêu.
- Đã đọc/ap dụng `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines` và lấy guideline UI hiện hành. Không tìm thấy skill `verification-before-completion` đã cài; thực hiện trực tiếp các kiểm tra bắt buộc thay thế, không tuyên bố đã kích hoạt skill thiếu.
- Giữ kiến trúc App Router/Prisma hiện có, không đổi schema/migration. Chọn module parser/network/media/storage/job riêng, modal có state độc lập và polling tuần tự, tái dùng cơ chế Admin thật từ DB.

### Phase 4: Triển khai

- Thêm `lib/scraper/{types,network,normalizer,media,adapters,storage,job-manager,laca-codec}.ts` và README vận hành.
- Adapter riêng Truyện Đọc Việt/Lạc Ca và Generic HTML Extractor. Hỗ trợ phân trang, giới hạn chương, chuẩn hóa tiếng Việt, bỏ khóa/VIP/xem thử, không đăng nhập hay vượt khóa nguồn. Giao thức Lạc Ca công khai được chuyển vào lib; script codec cũ re-export để tránh nhân đôi logic.
- Network kiểm tra IP công khai, IPv4/IPv6/mapped IP, DNS và từng redirect; ghim IP socket để ngăn DNS rebinding. Cấm credentials trong URL, port không chuẩn; timeout 30 giây, tối đa phản hồi 16 MB. Nguồn chặn/rate limit sẽ dừng.
- Ảnh bìa và ảnh chương (src/data-src/data-original) tải cục bộ, chuyển WebP bằng Sharp, ghi file tạm + rename và cache hash URL. Nội dung chỉ giữ chữ sạch và thẻ ảnh cục bộ do importer sinh. Bổ sung render ảnh an toàn trong ChapterText, không dùng dangerouslySetInnerHTML.
- Tái sử dụng truyện theo URL/slug/tên chuẩn hóa; thể loại/tác giả dùng khóa tên chuẩn hóa và transaction khóa metadata. Chương + nội dung lưu trong cùng transaction, kiểm tra hai UNIQUE, giữ giá/VIP/ID cũ khi cập nhật.
- Job Map gắn globalThis giữ qua HMR, một job hoạt động/process, bốn worker chương, delay 200–400 ms, hủy bằng AbortController, giữ dữ liệu đã commit. API POST/GET/DELETE yêu cầu Admin trong DB, kiểm tra origin mutation, validate Zod, giới hạn chủ phiên.
- Modal `components/stories/ImportUrlModal.tsx`: URL, giới hạn, tải ảnh, skip chương cũ/khóa; progress, bìa, bộ đếm/log, hủy, link xem truyện và refresh danh sách. Có sessionStorage để tìm lại phiên trong cùng tab.
- Dependencies thêm: cheerio (DOM parser), ipaddr.js (phân loại IP), sharp (chuyển ảnh an toàn; khai báo trực tiếp thay vì phụ thuộc bắc cầu).

### Phase 5: Xác minh

- Trình duyệt thật localhost:3000/admin/stories: mở modal, nhập `https://truyendocviet1.shop/doc-truyen/trong-sinh-chi-danh-mon-doc-sung.html`, giới hạn 5, chạy hoàn tất 100%, lưu **1 truyện mới ID 156 + 5 chương**, 1 ảnh bìa cục bộ; đóng modal thấy truyện và 5 chương ngay đầu danh sách Admin.
- Chương mẫu không có ảnh minh họa. Kiểm tra fixture riêng với ảnh nguồn thật: tải `/uploads/chapters/import-verification/...webp`, decode WebP thành công, HTTP localhost 200, loại onerror và sửa dấu tiếng Việt. Fixture ảnh được chuyển vào cache sau kiểm tra, không chèn ảnh giả vào nội dung truyện.
- HTTP/MySQL acceptance: POST/GET/DELETE thiếu đăng nhập trả 401; tài khoản thường dù JWT ghi admin vẫn bị DB role check trả 403; localhost/loopback/metadata IP/file URL trả 400; job khác chủ trả 404; job đồng thời trả 409; DELETE dẫn tới cancelled.
- Import lại cùng URL: **0 chương ghi mới, 5 chương bỏ qua**. Kiểm tra rollback chương/nội dung trên MySQL thật thành công, tổng chương không đổi sau rollback.
- So sánh snapshot trước/sau: **77 truyện và 2.493 chương cũ giữ nguyên**, hash schema không đổi. Sau nhập có tổng **78 truyện / 2.498 chương** (bao gồm bản ghi cũ soft-delete). Không sửa giá/VIP cũ.
- Đã dọn tài khoản Admin kiểm thử tạm và quyền của tài khoản đó; giữ truyện được nhập bằng giao diện theo yêu cầu.
- Kiểm tra tự động: lint toàn dự án 0 lỗi/cảnh báo; TypeScript 0 lỗi; **29/29 tests Passed** (scraper/SSRF/redirect, crawler, Unicode và render ảnh); production build Next.js thành công.
- Bằng chứng/log tại `node_modules/.cache/import-url/`, `import-url-{lint,typecheck,tests,build}.log`; ảnh modal `node_modules/.cache/import-url/modal-completed.png`. Script acceptance: `scripts/verify-import-url.mjs` (cần QA actor tạm của phiên xác minh).

### Phase 6: Kết quả và giới hạn

- Tính năng đã hoạt động qua UI/API/DB thật; không chạy lại crawler LoHi đã dừng.
- Generic Extractor hỗ trợ cấu trúc HTML phổ biến, không thể bảo đảm mọi website hoặc nội dung chỉ có sau JavaScript/đăng nhập. Lạc Ca chỉ nhập plaintext được công khai.
- Job in-memory không sống qua restart và không chia sẻ giữa nhiều process. Cần Node server sống lâu, thư mục uploads ghi được/lưu bền vững; serverless có thể cắt job dài theo giới hạn nền tảng (route khai báo 300 giây). Nâng cấp queue/object storage là công việc riêng khi triển khai nhiều server.

## 2026-11-21 — Sửa import LoHi / Kiếm Lai

- Tái hiện đúng URL người dùng báo: `https://lohi2.com/truyen/kiem-lai`. Kết nối ghim IPv6 đầu tiên lỗi `ECONNRESET`; cùng nguồn ghim IPv4 trả HTTP 200. Importer chưa có adapter LoHi nên Generic HTML Extractor cũng không đủ cho mục lục dùng API.
- Network ưu tiên IPv4 công khai nếu có, tiếp tục kiểm tra tất cả kết quả DNS và ghim IP socket; không nới SSRF, TLS hay kiểm tra redirect.
- Thêm adapter LoHi dùng API công khai cho metadata, mục lục phân trang offset/limit và nội dung. Kiểm tra truyện/chương đúng ID, VIP, orbit buy-in, login, preview/truncated; không gửi Cookie/Authorization, không mở khóa nguồn.
- Thêm lỗi nguồn an toàn và bộ chuyển lỗi mạng/schema thành hướng dẫn cụ thể. Rate limit 429/503 tiếp tục dừng job, thông báo Retry-After nếu có. Lỗi DB/payload/stack không đưa ra UI. Khi chưa đọc mục lục, UI không còn trình bày `0/0 chương` như một tiến trình đang chạy; bộ đếm ghi rõ lỗi chương.
- Đã chạy job thật với giới hạn 5: tạo **Kiếm Lai ID 158**, lưu 5/5 chương và 1 ảnh bìa cục bộ. Chạy lại: 0 chương ghi, 5 chương bỏ qua. Mỗi chương đầu có khoảng 10.000–18.500 ký tự NFC. Trang `/truyen/kiem-lai/chuong-1` trả 200 và chứa đúng tên truyện/tiêu đề chương.
- Đối chiếu giữ nguyên toàn bộ **2.505 chương có trước lượt sửa** và các truyện khác; schema hash không đổi, không migration. Báo cáo `node_modules/.cache/import-url/lohi-fix-verification.json`. Không chạy lại crawler LoHi 110 truyện.
- Verification: lint các file liên quan Passed, TypeScript Passed, **33/33 tests Passed**, production build Passed. `npm run lint` toàn dự án Failed do lỗi ngoài phạm vi thay đổi ở `tests/notifications.mysql.test.mjs:68` (`@typescript-eslint/no-this-alias`); không sửa file đó.

## 2026-11-22 — Nâng cấp Import URL: toàn bộ chương, đa nguồn và tiếp tục có checkpoint

### Phase 1–3 — Hiểu, phân tích, lập kế hoạch

- Phạm vi theo lời đính chính của người dùng: nâng cấp **chức năng**, không chạy tải toàn bộ Kiếm Lai hay đợt crawl khác. Inspect cấu trúc bằng LeanCTX CLI; đọc skills React/composition/UI đã có. Skill verification-before-completion vẫn không có trong thư mục đã cài; thực hiện kiểm tra trực tiếp, không giả vờ kích hoạt.
- Tham khảo tài liệu chính thức Next.js after/maxDuration, OWASP SSRF, RFC9110/MDN Retry-After, Schema.org Book/ItemList, MDN rel và Cheerio. Link và quyết định nằm trong lib/scraper/README.md.
- Chọn nâng cấp parser và adapter hiện có, checkpoint filesystem riêng và API tiếp tục; không thêm framework/queue/dependency, không sửa schema hay migration. Không tuyên bố đọc được mọi website hoặc mở khóa nguồn.

### Phase 4 — Triển khai

- UI mặc định **Toàn bộ chương công khai**, có radio **Giới hạn số chương** riêng. Phiên giới hạn hoàn tất có nút chuyển sang toàn bộ; phiên bị lỗi/gián đoạn có **Tiếp tục chương còn thiếu**. Hiển thị giai đoạn, thời gian chờ, tổng nguồn, phạm vi, cảnh báo mục lục, mã lỗi và lý do từng chương. Giữ ID phiên qua reload, dừng polling vô hạn khi 401/403/404.
- Generic Extractor mới: JSON-LD Book/Chapter/ItemList, metadata, mục lục scoped/trang riêng, rel next/head next, select/data URL; bỏ truyện liên quan, phát hiện lặp trang/trùng số, duyệt mọi trang trước khi chọn chương đầu cho chế độ giới hạn. Giải relative URL theo trang cuối sau redirect. Metadata/khoá định danh hỗ trợ Unicode ngoài Latin.
- Độ đầy đủ mục lục có cờ catalogueComplete/sourceTotalChapters/warnings. Chưa xác nhận đủ sẽ báo **partial**, không báo đã lấy toàn bộ. JavaScript/API chưa hỗ trợ, URL sai, đăng nhập/VIP, nội dung thiếu và nguồn đổi cấu trúc có thông báo riêng.
- Network tiếp tục DNS/IP pinning và SSRF cho mọi URL/redirect/ảnh; ưu tiên IPv4 công khai, timeout DNS/socket, decode charset và gzip/br/deflate có giới hạn. Cooldown chung và retry hữu hạn theo Retry-After giây/HTTP-date/JSON; tăng giãn request. Không retry CAPTCHA/403. Chờ dài hoặc hết lượt thử thì lưu thời điểm tiếp tục; cooldown nguồn lưu bền vững, tạo lại job không tự bỏ qua thời gian chờ.
- Job vẫn tối đa 4 worker. Checkpoint sau từng chương tại **.data/story-imports/** ngoài public (đã gitignore), atomic rename, owner scope, giới hạn 1MB. Sau restart đọc lại thành **interrupted** và có thể tiếp tục từ DB, không tự tải khi server bật lại. Mỗi lần chạy tối đa 240 giây trước maxDuration300; đây là giới hạn một phiên, không phải giới hạn tổng chương. Nút tiếp tục tạo phiên mới skipExisting=true.
- API thêm POST /api/admin/stories/import-url/[jobId] để tiếp tục; vẫn yêu cầu Admin thật, kiểm tra origin, owner scope và Zod. Lỗi checkpoint trả JSON có mã an toàn.
- Storage sửa skip-existing chỉ bỏ body có chữ, phục hồi body null/rỗng mà giữ ID/paywall. Metadata + truyện mới + chương đầu/nội dung đầu commit trong cùng transaction; không để truyện rỗng nếu body đầu lỗi. Khi checkpoint/coordinator lỗi, abort và đợi tất cả worker dừng trước khi kết thúc để tránh ghi DB sau khi UI đã báo dừng.
- Ảnh chương hỏng không làm mất phần chữ; ghi IMAGE_FAILED/partial. Có thể cập nhật lại nội dung với skipExisting=false để thử tải lại ảnh.

### Phase 5 — Xác minh

- Tất cả kiểm tra importer ở lượt này dùng fixture/mock và thư mục tạm; **không chạy import thật, không ghi thêm truyện/chương và không đổi dữ liệu ứng dụng**.
- Trình duyệt kiểm tra trực tiếp component qua harness tạm localhost: radio mặc định toàn bộ, trường giới hạn disabled; chọn giới hạn bật trường số; chọn lại toàn bộ khóa trường số. Fixture gián đoạn hiển thị lý do, cảnh báo chưa đủ mục lục và nút tiếp tục. Harness đã xóa, không đưa vào sản phẩm; screenshot node_modules/.cache/import-upgrade-ui.png.
- Tests bao phủ hơn15 chương, tối đa4 worker, phân trang/JSON-LD/latest-first, chapter identity/khóa/xem thử, SSRF/redirect/DNS pinning, Retry-After/cancel/timeout, owner quyền API, checkpoint atomic/corrupt/restart, budget interruption, worker siblings khi lỗi checkpoint, Unicode metadata, transaction rollback và UI.
- `npm run lint`: Passed, 0 lỗi/cảnh báo. `npx tsc --noEmit`: Passed. **83/83 tests liên quan Passed**. `npm run build`: Passed production build. Log node_modules/.cache/import-upgrade-{lint,tsc,tests,build}.log.

### Phase 6 — Giới hạn vận hành

- Nguồn HTML công khai phổ biến + adapter LoHi/Truyện Đọc Việt/Lạc Ca được hỗ trợ; nguồn chỉ có JS/API riêng, cần đăng nhập, CAPTCHA hoặc trả phí sẽ có lý do rõ và có thể cần adapter mới. Không có cam kết mọi website.
- Checkpoint/khóa job hiện hướng tới **một Node process và ổ đĩa bền vững**. Không phải distributed queue. Nhiều máy/serverless cần queue/worker và storage chung riêng; giới hạn host ngắn hơn có thể ngắt sớm. Phần DB đã commit vẫn có thể tiếp tục bằng URL/skip-existing.

- Kiểm tra cuối bằng truy vấn chỉ đọc: kết nối `web_truyen`, inventory Kiếm Lai trả đúng 5 chương đã có, hash schema giữ nguyên. Lượt nâng cấp không khởi chạy import thật.

## 2026-11-22 — Studio và trình soạn thảo chương dùng chung

### Phase 1–3 — Understand / Analyze / Plan

- Đã inspect bằng LeanCTX: schema, kết nối Prisma, session DB, Admin chapters, ChapterForm, API chương/mua chương và package. Đã đọc skill React/composition/UI/LeanCTX; `verification-before-completion` và `writing-plans` không có trong thư mục skills đã tìm. Kế hoạch: `docs/STUDIO_IMPLEMENTATION_PLAN.md`.
- Schema thực tế dùng `TacGiaDich`, `ViTien`, `LichSuGiaoDich`; không có FK giữa tài khoản và tác giả. Ownership được server đăng ký vào `CaiDatHeThong`, kiểm tra tài khoản hoạt động, truyện sáng tác và đúng quan hệ tác giả chính. Không suy đoán quyền từ tên.

### Phase 4 — Implement

- Editor dùng chung Admin/Studio: maxChapter + 1, Zen, 3 màu giấy, 16–22px, thống kê và thời gian đọc, chuẩn hóa tiếng Việt, phân cảnh/ghi chú, nháp thiết bị mỗi 3 giây, khôi phục, giá xu, nháp/công khai, lưu và viết tiếp. Giữ cộng tác CodeMirror; bảo toàn nội dung khi bật/tắt và khi chưa kết nối xong.
- Parser DOCX/TXT/MD tối đa 10 MB, UTF-8/NFC, tách Chương/Hồi, xem trước/chọn/sửa/đặt giá và trạng thái hàng loạt. Mammoth chạy ở server; kiểm ZIP/CRC và giải nén thực tối đa 40 MB. Mỗi lô tối đa 500 chương; lỗi UNIQUE rollback metadata, nội dung, đếm chương và thông báo.
- API Admin next-number/import-doc; API Studio truyện/chương/ownership/import; dashboard, tạo/sửa/ẩn truyện, mục lục phân trang, menu Header. Nháp dùng isDeleted và marker riêng; độc giả không được đọc nháp/thùng rác.
- Xuất bản lần đầu tạo inbox trong transaction và dispatch Socket.IO sau commit. Chỉnh sửa/ẩn/xuất bản lại không tạo lặp thông báo.
- VIP chia floor(70% giá) xu cho tác giả khác người mua trong cùng transaction debit/quyền đọc/credit/ledger; khóa ví theo ID. Huy hiệu tác giả và phản hồi bình luận dựa trên ownership server, có phân trang.

### Phase 5 — Verify

- Lint 0 lỗi/cảnh báo, TypeScript 0 lỗi, production build thành công. Suite toàn bộ: **329 Passed, 0 Failed, 7 MySQL opt-in Skipped**; chạy riêng các test MySQL liên quan như bên dưới. Log tại `node_modules/.cache/studio-*.log`.
- Chạy riêng MySQL: 18/18 Admin/purchase/social và 1/1 Studio Passed trên database tạm tự dọn. Xác nhận ownership A/B, tạo/tái sử dụng tác giả, nháp → xuất bản một lần, batch rollback, chia doanh thu và giao dịch đồng thời.
- Trình duyệt kiểm tra component thật qua harness tạm không ghi DB: gợi ý chương 16, TXT tách 2 chương và sửa NFC, giá 5 hàng loạt, nạp toàn văn, phân cảnh, giấy sepia 22px, Zen, khôi phục nháp khi mở lại. Harness và API mô phỏng đã xóa. Tab kiểm thử Admin yêu cầu đăng nhập; chưa chạy trọn luồng trình duyệt có xác thực.
- Truy vấn chỉ đọc xác nhận database `web_truyen`, 81 truyện / 2596 chương. Không ghi dữ liệu ứng dụng, không migration. Schema SHA-256 giữ nguyên: `BDE5DF81132B2CE2E2C68FDF6E5BF7294E80CBE04775E10D85A0C8CAEDDE3C64`.

### Phase 6 — Notes

- Hướng dẫn sử dụng, quyền sở hữu và giới hạn: `docs/STUDIO.md`. Truyện crawl cũ không tự gán chủ sở hữu. Ví dùng số nguyên nên chương giá 5 xu trả tác giả 3 xu. Nháp thiết bị không đồng bộ máy khác. Realtime vẫn cần gateway Socket.IO hoạt động; inbox DB đã được kiểm thử.

## 2026-11-24: Chuyển Import URL sang TiDB queue và Render worker

### Mục tiêu và kiến trúc

- Dùng bảng `background_jobs` đã có trên TiDB làm durable queue. Next.js chỉ xác thực, enqueue và đọc trạng thái; `socket-server` trên Render nhận và thực thi job `IMPORT_NOVEL`.
- Giữ Socket.IO và worker trong cùng container nhưng chạy thành hai process riêng qua supervisor. Worker mặc định xử lý một job để không làm nghẽn CPU hoặc RAM của dịch vụ realtime.
- Không thêm Redis, Outbox hoặc migration mới trong lượt này. Không chạy migration hay câu lệnh thay đổi schema trên production.

### Triển khai worker

- Thêm payload và result schema chặt cho `IMPORT_NOVEL`: URL HTTP/HTTPS công khai, tùy chọn giới hạn chương, tải ảnh, bỏ chương đã có, bỏ chương khóa, chủ sở hữu và request ID.
- Worker nhận `AbortSignal`, kiểm tra yêu cầu hủy trong TiDB khoảng mỗi giây và xử lý đúng race giữa hủy với hoàn tất. Lease, heartbeat và retry tiếp tục dùng cơ chế queue chung.
- Tiến độ 0–100 và snapshot chi tiết được ghi theo đợt vào `background_jobs.progress` và `background_jobs.result`: số chương đã lưu, bỏ qua, khóa, lỗi, issues, story ID, slug, nguồn và cooldown.
- Executor trên Render không còn time budget 40 giây của Vercel. Import truyện dài có thể chạy đến khi hoàn tất, bị hủy hoặc gặp lỗi nguồn có thể hành động.
- Giữ chống server-side request forgery (SSRF), DNS/IP pinning, kiểm tra từng redirect, chống trùng chương, transaction chương/nội dung, cooldown nguồn và phân loại lỗi an toàn.
- Ảnh bìa và ảnh chương được kiểm tra URL công khai rồi tải lên Cloudinary. Worker không ghi media runtime vào `public`.
- Thêm `cheerio` và `ipaddr.js` trực tiếp vào package `socket-server`; Docker build tiếp tục dùng context `socket-server`.

### Cập nhật API và giao diện Admin

- `POST /api/admin/stories/import-url` bỏ `after()` và job trong RAM. Route kiểm tra Admin, same-origin, URL/cooldown, enqueue vào TiDB rồi trả HTTP 202 cùng `jobId`.
- `GET` và `DELETE /api/admin/stories/import-url/[jobId]` dùng owner scope trong TiDB. DELETE gửi yêu cầu hủy bền vững; POST tiếp tục giữ control khôi phục của giao diện nhưng tạo job mới với `skipExisting=true`.
- Định dạng response `ImportJob` được giữ tương thích để modal Admin tiếp tục hiển thị tiến độ, lỗi, retry và link truyện.

### Kết nối TiDB và sửa deployment

- MariaDB pool parse `DATABASE_URL` thành host, port, user, password và database riêng. Kết nối TiDB Cloud bật Transport Layer Security (TLS) khi host hoặc query yêu cầu SSL, với `connectionLimit=3`, `acquireTimeout=20000` và `connectTimeout=15000`.
- Log lỗi kết nối hiển thị cause đã redacted; không in password, token hoặc connection string.
- Vercel từng lỗi vì `.vercelignore` loại `socket-server/` trong khi mã Next.js re-export module từ thư mục đó. Đã chuyển contract/state phía Next về `schemas/import-novel-job.schema.ts` và `lib/scraper/state.ts`; toàn bộ `app/`, `components/`, `lib/` và `schemas/` không còn import runtime Render.
- Thêm regression test xác nhận `.vercelignore` vẫn chặn `socket-server/` và mã Next.js không tạo lại dependency ngược. Render tiếp tục tự chứa runtime trong build context hiện tại.

### Xác minh và phát hành

- Worker handler được test cho progress theo đợt, hủy giữa chừng, retry, race hoàn tất/hủy, Cloudinary, TLS và redaction.
- Suite sau khi sửa boundary Vercel: **392 tests, 384 Passed, 0 Failed, 8 MySQL integration Skipped**. Lint, TypeScript, Next.js production build và `socket-server` build đều Passed.
- Commit `330affd` triển khai `IMPORT_NOVEL` worker. Commit `2e51cb9` sửa boundary Vercel.
- Vercel production build commit `2e51cb9` đã vượt Turbopack, TypeScript, 78/78 static pages và chuyển trạng thái **Ready** tại [Web Novel production](https://web-novel-ete3.vercel.app).
- Chưa chạy import truyện dài end-to-end trên production trong lượt xác minh này. Cần theo dõi Render logs và thử một truyện ngắn trước khi dùng cho lô lớn.

## 2026-11-24: Đồng bộ thẻ Dashboard với bộ lọc biểu đồ

### Thay đổi

- Bốn thẻ Dashboard dùng cùng khoảng ngày trong URL với biểu đồ. Thay đổi khoảng thời gian hoặc ngày tùy chọn sẽ hủy request cũ và tải số liệu mới.
- Thay đổi riêng chỉ số biểu đồ hoặc cách gom ngày/tuần/tháng không gọi lại overview vì tổng theo kỳ không đổi.
- API `GET /api/admin/dashboard/overview` dùng cùng `statisticsFilters` và `statisticsWindow` với `/api/statistics`. Mốc ngày tiếp tục tính theo múi giờ Việt Nam.
- Các truy vấn người dùng, truyện, chương, lượt xem và doanh thu chạy song song. Người dùng, truyện và chương soft-delete không được tính; doanh thu chỉ gồm hóa đơn nạp thành công.
- Đổi nhãn thẻ thành `Truyện mới`, `Người dùng mới`, `Lượt xem truyện mới` và `Doanh thu` để phản ánh phạm vi thời gian.
- Hệ thống chưa lưu sự kiện cho từng lượt xem. Thẻ lượt xem hiện cộng `luot_xem` của các truyện được tạo trong kỳ; muốn đo lượt xem phát sinh trong kỳ cần thêm bảng sự kiện riêng.

### Xác minh và trạng thái phát hành

- Test mới xác nhận overview tái sử dụng đúng custom date window và không refetch khi chỉ đổi metric/group.
- `npx tsc --noEmit`: Passed. `npm run lint`: Passed. `npm run build`: Passed.
- Suite toàn bộ: **393 tests, 385 Passed, 0 Failed, 8 MySQL integration Skipped**.
- File thay đổi: `app/admin/dashboard/page.tsx`, `app/api/admin/dashboard/overview/route.ts`, `components/admin/Chart.tsx`, `lib/admin-statistics.ts`, `services/statisticsService.ts`, `tests/admin-statistics.test.mjs` và `PROJECT_PROGRESS.md`.
- Commit `b72bf05` đã đưa thay đổi Dashboard lên `main`; Vercel báo deployment hoàn tất thành công. Chỉ lần cập nhật `PROJECT_PROGRESS.md` này còn ở workspace, chưa commit hoặc push.
