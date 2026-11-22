# WEB_NOVEL · Tóm tắt dự án

_Cập nhật ngày 21/11/2026_

WEB_NOVEL là nền tảng web đọc và quản lý truyện tiếng Việt. Độc giả có thể tìm truyện, đọc tiếp từ lịch sử, tương tác và mua chương VIP bằng xu. Quản trị viên có CMS để quản lý nội dung, tài khoản và biên tập chương cộng tác.

## Tính năng hiện có

| Khu vực | Đã triển khai |
| --- | --- |
| Khám phá | Trang chủ, tìm kiếm và bộ lọc, thể loại, truyện mới, truyện hoàn thành, bảng xếp hạng và chi tiết truyện. |
| Đọc truyện | Mục lục có tìm kiếm và phân trang, điều hướng chương bằng bàn phím, tùy chỉnh chữ và nền đọc, lưu tiến độ và đọc tiếp. |
| Tài khoản | Đăng ký, đăng nhập, đăng xuất, sửa tên và ảnh đại diện qua URL HTTPS, đổi mật khẩu bằng mật khẩu hiện tại. Có nút sáng/tối trên Header. |
| Tương tác | Theo dõi và bỏ theo dõi truyện, tủ sách, lịch sử đọc, bình luận, đánh giá và thông báo có trạng thái đã đọc. |
| Ví và chương VIP | Xem số dư và lịch sử giao dịch có phân trang. Mở khóa chương VIP bằng xu. Nạp mô phỏng các gói 20, 50 hoặc 100 xu trong development. |
| CMS | Dashboard, quản lý người dùng, thể loại, truyện và chương. Nhập và xuất Excel cho cả bốn nhóm. Có thông báo quản trị và biên tập chương cộng tác. |

Các đường dẫn thường dùng gồm `/tim-kiem`, `/the-loai`, `/truyen/<slug>`, `/truyen/<slug>/<chapterSlug>`, `/tu-sach`, `/lich-su`, `/thong-bao`, `/profile`, `/vi-xu` và `/admin/dashboard`.

## Kiến trúc và vị trí mã

| Vị trí | Vai trò |
| --- | --- |
| `app/(reader)/`, `app/admin/` | Trang độc giả và CMS trên Next.js 16.2.4 App Router, React 19 và TypeScript strict. Các trang mặc định dùng Server Components. |
| `components/`, `hooks/`, `context/` | Giao diện Tailwind CSS 4 và shadcn/ui, biểu mẫu React Hook Form, hiệu ứng GSAP, phiên đăng nhập phía client và tương tác trình đọc. |
| `app/api/`, `schemas/` | Route Handlers cho xác thực, đọc truyện, tương tác, ví và CMS. Zod kiểm tra dữ liệu đầu vào. |
| `lib/queries/`, `lib/server/`, `lib/prisma.ts` | Truy vấn phía server, kiểm tra phiên, xử lý ghi dữ liệu và kết nối Prisma 7.7 với MySQL qua adapter MariaDB. |
| `prisma/`, `prisma.config.ts` | Schema, lịch sử migration và cấu hình Prisma CLI. Prisma Client sinh vào `app/generated/prisma/`. |
| `socket-server/` | Dịch vụ Express và Socket.IO riêng. Xác thực JWT cho kết nối và dùng Yjs để đồng bộ văn bản trong phòng biên tập. |
| `tests/` | Bộ test Node.js cho logic, API, các luồng đọc và tích hợp MySQL. |

Phiên xác thực dùng JWT trong cookie HttpOnly. Server kiểm tra tài khoản và quyền trước khi xử lý API bảo vệ. Trình đọc kiểm tra quyền trước khi tải nội dung chương VIP. Mua chương ghi quyền đọc, trừ xu và ghi lịch sử trong cùng transaction. Nạp mô phỏng cũng cập nhật số dư và ghi giao dịch trong cùng transaction.

## Cây thư mục

```text
WEB_NOVEL/
├── app/
│   ├── (reader)/            # Trang độc giả
│   ├── admin/               # CMS
│   ├── api/                 # Route Handlers
│   ├── demo/                # Màn hình demo
│   ├── generated/prisma/    # Prisma Client sinh từ schema
│   ├── layout.tsx           # Layout gốc và ThemeProvider
│   └── globals.css          # Kiểu toàn cục
├── components/
│   ├── account/, layout/    # Hồ sơ, ví, Header, Footer
│   ├── home/, search/       # Khám phá và lọc truyện
│   ├── story/, chapter/     # Chi tiết truyện và trình đọc
│   ├── history/, notifications/, blog/
│   ├── admin/, users/, genres/, stories/, chapters/, editor/
│   └── common/, form/, ui/
├── context/                 # AuthContext
├── hooks/                   # CMS, cài đặt đọc, Yjs và kéo thả
├── lib/
│   ├── queries/             # Truy vấn trang độc giả
│   ├── mappers/             # Định dạng dữ liệu cho giao diện
│   └── server/              # Xác thực, mutation, ví và Excel
├── schemas/                 # Zod cho biểu mẫu và truy vấn
├── services/                # Dịch vụ thể loại và thống kê
├── socket-server/
│   ├── auth/                # Xác thực kết nối
│   ├── handlers/            # Thông báo và cộng tác
│   ├── rooms/               # Phòng biên tập đang hoạt động
│   └── server.ts            # Express, Socket.IO và API nội bộ
├── prisma/                  # Schema và hai migration MySQL
├── public/                  # Tài nguyên tĩnh
├── tests/                   # Node test runner và tích hợp MySQL
├── proxy.ts                 # Kiểm tra truy cập route quản trị
├── prisma.config.ts         # Datasource Prisma CLI
├── next.config.ts           # Cấu hình Next.js
├── eslint.config.mjs        # Cấu hình lint
└── PROJECT_PROGRESS.md      # Nhật ký theo giai đoạn
```

## Danh mục 26 trang web

Nhóm thư mục `(reader)` tổ chức mã nguồn. URL chỉ chứa các phân đoạn bên dưới nhóm đó.

### Trang độc giả

| URL | Chức năng | Tệp |
| --- | --- | --- |
| `/` | Trang chủ, truyện nổi bật, truyện cập nhật, gợi ý và đọc tiếp. | `app/(reader)/page.tsx` |
| `/tim-kiem` | Tìm kiếm, bộ lọc và sắp xếp. | `app/(reader)/tim-kiem/page.tsx` |
| `/the-loai` | Danh mục thể loại. | `app/(reader)/the-loai/page.tsx` |
| `/the-loai/[slug]` | Danh sách truyện trong một thể loại. | `app/(reader)/the-loai/[slug]/page.tsx` |
| `/xep-hang` | Bảng xếp hạng. | `app/(reader)/xep-hang/page.tsx` |
| `/truyen-moi` | Truyện mới. | `app/(reader)/truyen-moi/page.tsx` |
| `/truyen-full` | Truyện đã hoàn thành. | `app/(reader)/truyen-full/page.tsx` |
| `/truyen/[slug]` | Chi tiết truyện, mục lục, theo dõi, bình luận và đánh giá. | `app/(reader)/truyen/[slug]/page.tsx` |
| `/truyen/[slug]/[chapterSlug]` | Trình đọc, cài đặt đọc và màn hình khóa chương VIP. | `app/(reader)/truyen/[slug]/[chapterSlug]/page.tsx` |
| `/dang-nhap` | Đăng nhập và quay về trang nội bộ. | `app/(reader)/dang-nhap/page.tsx` |
| `/dang-ky` | Đăng ký độc giả. | `app/(reader)/dang-ky/page.tsx` |
| `/tu-sach` | Truyện đang theo dõi. | `app/(reader)/tu-sach/page.tsx` |
| `/lich-su` | Lịch sử và vị trí đọc gần nhất. | `app/(reader)/lich-su/page.tsx` |
| `/thong-bao` | Hộp thông báo cá nhân. | `app/(reader)/thong-bao/page.tsx` |
| `/profile` | Hồ sơ, ảnh đại diện, đổi mật khẩu. | `app/(reader)/profile/page.tsx` |
| `/vi-xu` | Số dư, lịch sử giao dịch, nạp xu mô phỏng. | `app/(reader)/vi-xu/page.tsx` |

### CMS và demo

| URL | Chức năng | Tệp |
| --- | --- | --- |
| `/admin` | Điểm vào quản trị. | `app/admin/page.tsx` |
| `/admin/dashboard` | Số liệu tổng quan và tài khoản gần đây. | `app/admin/dashboard/page.tsx` |
| `/admin/users` | Quản lý tài khoản. | `app/admin/users/page.tsx` |
| `/admin/genres` | Quản lý thể loại. | `app/admin/genres/page.tsx` |
| `/admin/stories` | Quản lý truyện. | `app/admin/stories/page.tsx` |
| `/admin/stories/[id]` | Chi tiết truyện trong CMS. | `app/admin/stories/[id]/page.tsx` |
| `/admin/chapters` | Quản lý và biên tập chương. | `app/admin/chapters/page.tsx` |
| `/admin/notifications` | Thông báo quản trị. | `app/admin/notifications/page.tsx` |
| `/admin/settings` | Trang hiện dùng biểu mẫu và API quản lý truyện. | `app/admin/settings/page.tsx` |
| `/demo/follow` | Màn hình demo thông báo theo dõi. | `app/demo/follow/page.tsx` |

## Danh mục 37 route API Next.js

Mỗi URL ánh xạ tới `app/api/<đường-dẫn>/route.ts`. API quản trị kiểm tra quyền admin. API dữ liệu cá nhân giới hạn truy cập theo phiên hiện tại.

### Độc giả, xác thực và hỗ trợ

| URL | Phương thức | Chức năng |
| --- | --- | --- |
| `/api/auth/login` | `POST` | Đăng nhập và cấp cookie. |
| `/api/auth/logout` | `POST` | Xóa cookie phiên. |
| `/api/auth/me` | `GET` | Thông tin phiên, hồ sơ và số dư. |
| `/api/auth/register` | `POST` | Tạo tài khoản. |
| `/api/bookshelf` | `GET` | Tủ sách cá nhân. |
| `/api/chapters/[id]/progress` | `GET`, `PUT` | Đọc và lưu tiến độ chương. |
| `/api/chapters/[id]/purchase` | `POST` | Mua quyền đọc chương VIP. |
| `/api/demo/follow-notifications` | `GET`, `POST` | Demo quản trị ngoài production. |
| `/api/notifications` | `GET`, `PUT` | Lấy thông báo và đánh dấu đã đọc. |
| `/api/profile` | `PUT` | Lưu tên hiển thị và avatar. |
| `/api/profile/password` | `PUT` | Đổi mật khẩu. |
| `/api/reading-history` | `GET` | Lịch sử từ bản ghi tiến độ. |
| `/api/statistics` | `GET` | Thống kê dành cho quản trị. |
| `/api/truyen/[slug]/chapters` | `GET` | Mục lục, phân trang và tìm chương. |
| `/api/truyen/[slug]/comments` | `GET`, `POST` | Liệt kê và đăng bình luận cấp truyện. |
| `/api/truyen/[slug]/follow` | `GET`, `PUT` | Xem trạng thái, theo dõi hoặc bỏ theo dõi. |
| `/api/truyen/[slug]/rating` | `GET`, `PUT` | Xem và cập nhật đánh giá. |
| `/api/wallet/top-up` | `POST` | Nạp xu mô phỏng trong development. |

### Quản trị

| URL | Phương thức | Chức năng |
| --- | --- | --- |
| `/api/admin/chapter` | `GET`, `POST` | Liệt kê và tạo chương. |
| `/api/admin/chapter/[id]` | `GET`, `PUT`, `DELETE` | Xem, sửa và xóa chương. |
| `/api/admin/chapter/export` | `GET` | Xuất chương ra Excel. |
| `/api/admin/chapter/import` | `POST` | Nhập chương từ Excel. |
| `/api/admin/dashboard/overview` | `GET` | Thống kê CMS. |
| `/api/admin/dashboard/recent-users` | `GET` | Tài khoản gần đây. |
| `/api/admin/genres` | `GET`, `POST` | Liệt kê và tạo thể loại. |
| `/api/admin/genres/[id]` | `PUT`, `DELETE` | Sửa và xóa thể loại. |
| `/api/admin/genres/export` | `GET` | Xuất thể loại ra Excel. |
| `/api/admin/genres/import` | `POST` | Nhập thể loại từ Excel. |
| `/api/admin/notifications` | `GET`, `PUT`, `DELETE` | Danh sách, cập nhật và xóa thông báo quản trị. |
| `/api/admin/stories` | `GET`, `POST` | Liệt kê và tạo truyện. |
| `/api/admin/stories/[id]` | `GET`, `PUT`, `DELETE` | Xem, sửa và xóa truyện. |
| `/api/admin/stories/export` | `GET` | Xuất truyện ra Excel. |
| `/api/admin/stories/import` | `POST` | Nhập truyện từ Excel. |
| `/api/admin/users` | `GET`, `POST` | Liệt kê và tạo tài khoản. |
| `/api/admin/users/[id]` | `PUT`, `DELETE` | Sửa và xóa tài khoản. |
| `/api/admin/users/export` | `GET` | Xuất tài khoản ra Excel. |
| `/api/admin/users/import` | `POST` | Nhập tài khoản từ Excel. |

`POST /api/trigger-notification` thuộc dịch vụ Socket.IO riêng. Dịch vụ kiểm tra token nội bộ rồi phát `notification` tới phòng `admins`.

## Luồng nghiệp vụ và mã nguồn

| Luồng | Trình tự và tệp chính |
| --- | --- |
| Khám phá | `lib/queries/home.query.ts` cấp dữ liệu cho `components/home/`. Danh mục và tìm kiếm dùng `story-list.query.ts`, `lib/story-search.ts`, `schemas/story-query.schema.ts` và `components/search/` để đồng bộ bộ lọc với URL. |
| Đọc chương | `lib/queries/chapter.query.ts` lấy metadata, xác thực quyền đọc và chỉ tải nội dung khi đủ quyền. `components/chapter/` điều khiển mục lục, chương trước/sau, kiểu chữ và vị trí đọc. API mục lục trả metadata mà giao diện cần. |
| Tiến độ đọc | `hooks/useReaderSettings.ts` lưu cài đặt trình đọc trong cookie và localStorage. `ReadingProgress.tsx` gọi API tiến độ theo tài khoản và chương. Lịch sử, ReadingDock và ContinueReading dùng chung API lịch sử. |
| Phiên và hồ sơ | `lib/auth.ts` xử lý JWT và mật khẩu. `lib/server/auth-session.ts` kiểm tra tài khoản còn hoạt động và vai trò. `AuthContext` đọc `/api/auth/me`. Biểu mẫu hồ sơ và đổi mật khẩu nằm trong `components/account/`. |
| Ví và VIP | Trang ví đọc số dư và lịch sử từ DB. `ChapterUnlockCard.tsx` gọi API mua chương. Server lấy giá từ DB rồi ghi quyền đọc, trừ xu và ghi giao dịch trong cùng transaction. `lib/server/reader-wallet.ts` khóa dòng ví khi nạp mô phỏng và giới hạn các lượt nạp liên tiếp. |
| Tương tác | `components/story/detail/` kết nối theo dõi, bình luận và đánh giá với trang truyện. Theo dõi và đánh giá có khóa theo tài khoản và truyện. Tủ sách dùng `components/story/Bookshelf.tsx`. |
| Thông báo | `NotificationBell.tsx` và `NotificationList.tsx` dùng API thông báo cá nhân. Socket.IO phục vụ kênh thời gian thực riêng cho phòng admin. |
| CMS và Excel | `components/users/`, `genres/`, `stories/`, `chapters/` và các hook quản trị gọi `app/api/admin/`. `lib/server/spreadsheet-upload.ts` kiểm tra loại và giới hạn tệp. Route export tạo workbook bằng ExcelJS. |
| Cộng tác | `ChapterForm.tsx`, `CollaborationSwitch.tsx` và `useCollaborativeEditor.ts` nối CodeMirror với Yjs. Socket server giữ tài liệu đang biên tập theo phòng chương. Form CMS lưu nội dung xuống DB. |
| Sáng/tối | `app/layout.tsx` cung cấp ThemeProvider. `AccountThemeToggle.tsx` có mặt trong Header, Hồ sơ và Ví xu. Trình đọc chương có cài đặt trình bày riêng. |

### Sự kiện Socket.IO

| Hướng | Sự kiện |
| --- | --- |
| Client → server | `join-admin-room`, `join-chapter`, `leave-chapter`, `update-crdt`, `awareness-update`. |
| Server → client | `notification`, `authorization-error`, `initial-document`, `document-state`, `users-online`, `crdt-update`, `awareness-update-client`. |

State Yjs của phòng nằm trong `socket-server/rooms/activeDocs.ts`. Hai khâu đồng bộ văn bản trong phòng và lưu dữ liệu lâu dài đi qua các đường khác nhau. Socket.IO xử lý đồng bộ, còn form CMS gọi API quản trị để lưu nội dung.

## Danh mục 29 model Prisma

| Model | Dữ liệu |
| --- | --- |
| `TaiKhoan` | Thông tin đăng nhập và trạng thái. |
| `VaiTro` | Danh mục vai trò. |
| `VaiTroNguoiDung` | Quan hệ tài khoản và vai trò. |
| `ViTien` | Số dư và tổng xu đã nạp. |
| `HoSoCaNhan` | Hồ sơ, tên hiển thị và ảnh. |
| `Truyen` | Metadata và các chỉ số tổng hợp. |
| `Chuong` | Số chương, slug, metadata và giá. |
| `NoiDungChuong` | Nội dung chương lưu riêng. |
| `ChuongDaMua` | Quyền đọc đã mua. |
| `TheLoai` | Danh mục thể loại. |
| `TruyenTheLoai` | Quan hệ truyện và thể loại. |
| `TacGiaDich` | Tác giả và dịch giả. |
| `TheoDoiTruyen` | Quan hệ theo dõi truyện. |
| `BinhLuan` | Bình luận truyện, có thể liên kết chương. |
| `LikeBinhLuan` | Lượt thích bình luận. |
| `DanhGiaTruyen` | Đánh giá theo tài khoản và truyện. |
| `ReportViPham` | Dữ liệu báo cáo vi phạm. |
| `TienDoDoc` | Vị trí và thời điểm đọc theo chương. |
| `LichSuDoc` | Bảng lịch sử đọc. API hiện lấy từ tiến độ đọc. |
| `HoaDonNap` | Dữ liệu hóa đơn nạp. |
| `LichSuGiaoDich` | Loại giao dịch, số xu thay đổi, số dư trước và sau. |
| `TangThuong` | Dữ liệu tặng thưởng. |
| `KhuyenMai` | Dữ liệu khuyến mãi. |
| `SuDungKhuyenMai` | Tài khoản đã sử dụng khuyến mãi. |
| `ThongBao` | Thông báo theo tài khoản và trạng thái đọc. |
| `Quyen` | Quyển của truyện, có thể gắn với chương. |
| `CaiDatHeThong` | Dữ liệu tùy chỉnh hệ thống. |
| `truyen_tac_gia_dich` | Quan hệ truyện với tác giả hoặc dịch giả. |
| `yeuc_cau_rut_tien` | Dữ liệu yêu cầu rút tiền. |

Khóa duy nhất giới hạn số chương và slug theo truyện, vai trò theo tài khoản, theo dõi và đánh giá theo cặp tài khoản–truyện, số bản ghi tiến độ và quyền mua theo cặp tài khoản–chương. Repository có migration `20260618033143_increase_story_image_size` và `20261119000000_add_data_integrity_constraints`.

### Tính năng đang ở mức dữ liệu hoặc giao diện mẫu

- Trang chủ có thẻ bài viết mẫu từ `BlogSection.tsx`. Route `/blog` còn thiếu.
- Trang `/admin/settings` hiện dùng màn hình quản lý truyện. Phần cấu hình hệ thống có model `CaiDatHeThong`.
- Hóa đơn nạp, tặng thưởng, khuyến mãi, rút tiền, lượt thích bình luận và báo cáo vi phạm đã có model. Các màn hình và API riêng cho những luồng này còn thiếu.
- Quyển đã có model và quan hệ với chương. Màn hình quản lý quyển riêng còn thiếu.

## Chạy cục bộ

1. Chuẩn bị Node.js, npm và MySQL. Môi trường đã kiểm tra dùng Node.js 24.
2. Tạo `.env` dựa trên `.env.example`. Cấu hình `DATABASE_URL` cho Prisma CLI và `DATABASE_HOST`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME` cho ứng dụng. Dùng cùng database cho cả hai khi làm migration.
3. Sau khi kiểm tra database đích, chạy các lệnh sau tại thư mục gốc.

```powershell
npm ci
npx prisma generate
npx prisma migrate status
npm run dev
```

Với database mới dành cho dự án, chạy `npx prisma migrate deploy` sau khi xác nhận đích. Web mặc định chạy tại `http://localhost:3000`.

Khi cần thông báo thời gian thực hoặc biên tập cộng tác, cài phụ thuộc trong `socket-server`. Cấp cùng `JWT_SECRET` cho hai tiến trình và cấu hình `INTERNAL_SECRET_TOKEN`, `ALLOWED_ORIGINS` cùng các URL Socket.IO theo `.env.example`.

```powershell
npm --prefix socket-server ci
npm --prefix socket-server run dev
```

Dịch vụ socket mặc định dùng cổng 3001. Có thể cấp biến qua môi trường của tiến trình hoặc file `socket-server/.env` khi chạy từ thư mục đó.

## Kiểm thử và tình trạng đã xác nhận

```powershell
npm run lint
npx tsc --noEmit
$env:RUN_MYSQL_PURCHASE_TESTS = '1'
$env:RUN_MYSQL_SOCIAL_TESTS = '1'
node --import ./socket-server/node_modules/tsx/dist/loader.mjs --test 'tests/*.test.mjs'
npm run build
npm --prefix socket-server run build
```

- Đợt kiểm tra mã gần nhất ghi nhận **170/170 bài test đạt**, gồm các nhóm tích hợp mua chương, tương tác và tài khoản/ví trên MySQL. ESLint có 0 lỗi, 0 cảnh báo. TypeScript và build production Next.js đều qua. Build Socket.IO đã qua trong đợt kiểm tra dịch vụ riêng.
- Chrome đã kiểm tra hồ sơ, đổi mật khẩu, số dư riêng tư, phân trang, chuyển sáng/tối và nạp mô phỏng trên database kiểm thử. Nút theme trên Header đã được kiểm tra từ 320 đến 1440 px.
- MySQL cục bộ `web_truyen` đã ghi nhận đủ hai migration và khớp Prisma schema tại lần kiểm tra gần nhất. Cấu hình cục bộ ghi nhận Prisma CLI mặc định trỏ tới `mydb`, còn ứng dụng dùng `web_truyen`. Kiểm tra lại đích trước khi thao tác với migration.

## Phần còn lại

- Bổ sung bộ dữ liệu mẫu ổn định và kiểm tra trên trình duyệt toàn bộ luồng từ nạp xu đến mở khóa và đọc chương VIP.
- Kiểm tra biên tập cộng tác giữa nhiều phiên trình duyệt và khả năng kết nối lại.
- Nạp xu hiện phục vụ mô phỏng trong development. Nạp tiền thật cần một luồng thanh toán riêng nếu dự án mở rộng tới phạm vi đó.

## Phụ lục tra cứu tệp nguồn

Danh mục liệt kê các tệp hỗ trợ của ứng dụng theo nhóm. Tệp trang và Route Handlers nằm trong bảng URL phía trên. Prisma Client được sinh từ schema.

<details>
<summary>Thành phần giao diện (80)</summary>

```text
components/account/AccountField.tsx
components/account/AccountThemeToggle.tsx
components/account/DemoTopUpForm.tsx
components/account/ReaderAvatar.tsx
components/account/ReaderProfileForms.tsx
components/account/account-request.ts
components/admin/Chart.tsx
components/admin/Navbar.tsx
components/admin/Sidebar.tsx
components/admin/card.tsx
components/blog/BlogCard.tsx
components/chapter/ChapterDrawer.tsx
components/chapter/ChapterNavigation.tsx
components/chapter/ChapterText.tsx
components/chapter/ChapterUnlockCard.tsx
components/chapter/ReaderAppearance.tsx
components/chapter/ReaderNavigationProvider.tsx
components/chapter/ReaderSettingsPanel.tsx
components/chapter/ReaderView.tsx
components/chapter/ReadingProgress.tsx
components/chapters/ChapterFilter.tsx
components/chapters/ChapterForm.tsx
components/chapters/ChapterTable.tsx
components/common/EmptyState.tsx
components/common/ImportResultToast.tsx
components/common/Pagination.tsx
components/common/ScrollProgressButton.tsx
components/common/SectionHeader.tsx
components/editor/CollaborationSwitch.tsx
components/form/edit-task-form.tsx
components/genres/GenreForm.tsx
components/genres/GenreTable.tsx
components/history/ReadingHistory.tsx
components/home/BlogSection.tsx
components/home/CompletedStories.tsx
components/home/ContinueReading.tsx
components/home/GenreExplorer.tsx
components/home/HallOfFame.tsx
components/home/HeroStory.tsx
components/home/NewStories.tsx
components/home/PopularStories.tsx
components/home/ReadingDock.tsx
components/home/RecentlyUpdated.tsx
components/home/SmartGenreFilter.tsx
components/home/UniverseShowcase.tsx
components/home/story/HeroCarousel.tsx
components/home/story/HeroStoryCard.tsx
components/layout/Footer.tsx
components/layout/Header.tsx
components/layout/ReaderShell.tsx
components/notifications/NotificationBell.tsx
components/notifications/NotificationList.tsx
components/search/ActiveStoryFilters.tsx
components/search/SearchGenreChips.tsx
components/search/SearchInputBar.tsx
components/search/StorySearchProvider.tsx
components/stories/StoryCardList.tsx
components/stories/StoryFilter.tsx
components/stories/StoryForm.tsx
components/stories/StoryTable.tsx
components/story/Bookshelf.tsx
components/story/StoryBadge.tsx
components/story/StoryCard.tsx
components/story/StoryGrid.tsx
components/story/StoryListFilter.tsx
components/story/detail/ChapterList.tsx
components/story/detail/StoryDetailHeader.tsx
components/story/detail/StoryDetailTabs.tsx
components/story/detail/StoryRatingForm.tsx
components/story/detail/StoryReviews.tsx
components/ui/button.tsx
components/ui/form.tsx
components/ui/input.tsx
components/ui/label.tsx
components/ui/select.tsx
components/ui/sheet.tsx
components/ui/sonner.tsx
components/ui/textarea.tsx
components/users/UseForm.tsx
components/users/UseTable.tsx
```

</details>

<details>
<summary>Hooks, context và dịch vụ (12)</summary>

```text
context/AuthContext.tsx
hooks/useChapters.ts
hooks/useCollaborativeEditor.ts
hooks/useGenres.ts
hooks/useReaderSettings.ts
hooks/useReaderTypographyAnchor.ts
hooks/useReorderedItems.ts
hooks/useStories.ts
hooks/useStory.ts
hooks/useUsers.ts
services/genre.service.ts
services/statisticsService.ts
```

</details>

<details>
<summary>Truy vấn, xử lý phía server, mapper và schema (38)</summary>

```text
lib/admin-notification-types.ts
lib/api.ts
lib/auth-redirect.ts
lib/auth.ts
lib/axios.ts
lib/chapter-list.ts
lib/gsap.ts
lib/home-discovery.ts
lib/mappers/chapter.mapper.ts
lib/mappers/story-detail.mapper.ts
lib/mappers/story.mapper.ts
lib/prisma.ts
lib/queries/chapter.query.ts
lib/queries/genre.query.ts
lib/queries/home.query.ts
lib/queries/story-detail.query.ts
lib/queries/story-list.query.ts
lib/reader-navigation.ts
lib/reader-progress-state.ts
lib/reader-settings.ts
lib/reader-typography-anchor.ts
lib/reading-progress.ts
lib/schema.ts
lib/server/auth-session.ts
lib/server/reader-mutation.ts
lib/server/reader-page.ts
lib/server/reader-wallet.ts
lib/server/spreadsheet-upload.ts
lib/story-search.ts
lib/utils.ts
schemas/auth.schema.ts
schemas/chapter-schema.ts
schemas/genres_schema.ts
schemas/reader-account.schema.ts
schemas/reader-wallet.schema.ts
schemas/story-query.schema.ts
schemas/story-schema.ts
schemas/user_schema.ts
```

</details>

<details>
<summary>Layout, trạng thái trang và dịch vụ Socket.IO (20)</summary>

```text
app/(reader)/error.tsx
app/(reader)/layout.tsx
app/(reader)/loading.tsx
app/(reader)/not-found.tsx
app/(reader)/profile/loading.tsx
app/(reader)/truyen/[slug]/[chapterSlug]/error.tsx
app/(reader)/truyen/[slug]/[chapterSlug]/layout.tsx
app/(reader)/truyen/[slug]/[chapterSlug]/loading.tsx
app/(reader)/vi-xu/loading.tsx
app/admin/layout.tsx
app/favicon.ico
app/globals.css
app/layout.tsx
socket-server/auth/socketAuth.ts
socket-server/handlers/collaborative.ts
socket-server/handlers/notification.ts
socket-server/package.json
socket-server/rooms/activeDocs.ts
socket-server/server.ts
socket-server/tsconfig.json
```

</details>

<details>
<summary>Tệp kiểm thử (20)</summary>

```text
tests/admin-state-lifecycle.test.mjs
tests/auth-redirect.test.mjs
tests/bookshelf.test.mjs
tests/chapter-list.test.mjs
tests/chapter-purchase.mysql.test.mjs
tests/chapter-purchase.test.mjs
tests/home-discovery.test.mjs
tests/notifications.test.mjs
tests/reader-account.mysql.test.mjs
tests/reader-navigation.test.mjs
tests/reader-progress-lifecycle.test.mjs
tests/reader-progress-state.test.mjs
tests/reader-settings.test.mjs
tests/reader-typography-anchor.test.mjs
tests/reading-progress.test.mjs
tests/social.mysql.test.mjs
tests/story-comments.test.mjs
tests/story-follow.test.mjs
tests/story-rating.test.mjs
tests/story-search.test.mjs
```

</details>

Nhật ký triển khai, kết quả migration và checklist theo từng giai đoạn nằm trong [PROJECT_PROGRESS.md](PROJECT_PROGRESS.md).
