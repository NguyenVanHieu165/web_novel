# Sáng tác và import bản thảo

## Sử dụng

- Vào `/studio` từ menu tài khoản; đăng nhập bằng tài khoản đang hoạt động.
- Tạo truyện, mở **Viết / Quản lý chương**. Admin dùng cùng editor tại `/admin/chapters?storyId=<id>`.
- Chọn **Bản nháp (Ẩn)** hoặc **Xuất bản công khai**. Giá 0 là miễn phí; giá khác là VIP. **Lưu & Viết tiếp chương sau** lưu chương hiện tại rồi gợi ý số lớn nhất + 1.
- **Import từ file** nhận TXT/Markdown UTF-8 hoặc DOCX, tối đa 10 MB. Chế độ một chương giữ toàn văn và nhận diện dòng đầu làm tiêu đề nếu là `Chương N`/`Hồi N`. Chế độ tách chương cho phép sửa số, tiêu đề, bỏ chọn, đặt giá và trạng thái hàng loạt trước khi ghi.
- Mỗi lần import tối đa 500 chương, mỗi chương tối đa 1 triệu ký tự. Chia nhỏ bản thảo lớn. Xung đột số chương hoặc slug sẽ rollback cả lô; cả chương ẩn cũng giữ chỗ số/slug.
- Nháp thiết bị lưu mỗi 3 giây, tách theo tài khoản/truyện/chương và nhắc khôi phục khi mở lại. Nháp thiết bị không đồng bộ sang máy khác. Khi trình duyệt hết dung lượng hoặc chặn localStorage, editor báo rõ và cần lưu lên server.
- Zen dùng Fullscreen API (có fallback giao diện), 3 màu giấy, cỡ chữ 16–22; Escape thoát. Cộng tác CodeMirror trong Admin được giữ nguyên cho chương đã lưu.

## Quyền sở hữu với schema hiện có

Schema không có FK giữa `TaiKhoan` và `TacGiaDich`. Chỉ server tạo registry trong `CaiDatHeThong`:

| Khóa | Nội dung |
| --- | --- |
| `studio.author.<accountId>` | `version`, `authorId` |
| `studio.story.<storyId>` | `version`, `ownerId`, `authorId` |
| `studio.chapter.<chapterId>` | `version`, `publication` (`draft`/`published`/`trashed`), `notified` |

Ownership chỉ hợp lệ khi truyện `sang_tac` còn hoạt động, tài khoản hoạt động và đúng quan hệ tác giả chính. Tên trùng không cấp quyền. Dữ liệu truyện crawl trước đây không tự trở thành truyện thuộc người có cùng tên. Không cung cấp endpoint nhận ownerId từ client. Nếu sau này bổ sung quản trị registry, phải giữ các khóa này chỉ server được thay đổi.

Nháp dùng `Chuong.isDeleted=true` cùng marker `draft`; thùng rác không được tác giả sửa bằng cách đoán ID. Lịch sử mua, ví và phản hồi được giữ khi tác giả xóa mềm truyện. Các chức năng xóa cứng Admin có sẵn vẫn là thao tác quản trị và dọn cả marker chương.

## Transaction, thông báo và xu

Service dùng chung kiểm tra `SELECT DATABASE()` phải là `web_truyen`, kiểm tra quyền trong transaction, khóa dòng truyện và lưu metadata/nội dung/đếm chương/thông báo atomically. Hai UNIQUE được kiểm tra trước và DB vẫn là lớp bảo vệ cuối cùng.

Thông báo xuất bản đầu tiên được tạo trong transaction theo nhóm độc giả theo dõi, sau commit mới gọi gateway Socket.IO hiện có. Chỉnh sửa hoặc ẩn rồi xuất bản lại không tạo lặp thông báo. Nếu gateway mất kết nối, hộp thư DB vẫn còn; kiểm thử cục bộ không chứng minh giao hàng realtime trên môi trường triển khai.

Khi mua VIP, tác giả hợp lệ khác người mua nhận `floor(giaXu * 70 / 100)` xu. Ví dùng số nguyên nên 5 xu trả tác giả 3 xu, 10 xu trả 7 xu. Ghi dòng `LichSuGiaoDich` dương loại `mua_chuong` để phân biệt doanh thu với dòng mua âm. Debit, quyền đọc, credit và ledger cùng transaction; khóa ví theo ID tăng dần. Không trả doanh thu hai lần hoặc cho tự mua.

## Bảo vệ tài liệu và tài khoản

Phiên xác thực đọc lại tài khoản/quyền từ DB. API ghi kiểm tra cùng nguồn và Zod, chặn body quá lớn khi đang đọc stream. DOCX được kiểm ZIP directory/local headers, kích thước giải nén thực tối đa 40 MB, CRC và file trùng trước khi [Mammoth trích văn bản](https://github.com/mwilliamson/mammoth.js#extracting-raw-text). Không render HTML của file nhập vào DOM. Văn bản NFC và dấu đứng độc lập dùng chung `normalizeVietnameseText()`.

UI tuân theo [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines): nhãn điều khiển, focus bàn phím, thông báo trạng thái, cảnh báo thay đổi chưa lưu và xác nhận thao tác xóa.

## Kiểm thử

`npm run lint`, `npx tsc --noEmit`, `npm run build` và Node test runner của dự án. Các test MySQL là opt-in, tạo database tên ngẫu nhiên rồi dọn, không ghi vào database ứng dụng. Chạy test thường bằng:

```powershell
node --import ./socket-server/node_modules/tsx/dist/loader.mjs --test tests/*.test.mjs
```

Các biến opt-in hiện có: `RUN_ADMIN_CHAPTERS_MYSQL_TESTS=1`, `RUN_MYSQL_PURCHASE_TESTS=1`, `RUN_MYSQL_SOCIAL_TESTS=1`; test tích hợp Studio bổ sung dùng `RUN_STUDIO_MYSQL_TESTS=1`.
