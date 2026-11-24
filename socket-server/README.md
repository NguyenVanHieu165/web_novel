# Web Novel Realtime Server

Socket.IO phải chạy trên một dịch vụ Node.js duy trì kết nối lâu dài; không triển khai chung vào Vercel Functions.

## Biến môi trường bắt buộc

- `JWT_SECRET`: giống ứng dụng Next.js để xác thực cookie phiên.
- `INTERNAL_SECRET_TOKEN`: secret riêng dùng giữa Next.js và realtime server.
- `ALLOWED_ORIGINS`: URL production của web, phân tách bằng dấu phẩy nếu có nhiều origin.
- `INTERNAL_API_URL`: URL HTTPS production của ứng dụng Next.js, ví dụ `https://example.com`.
- `PORT`: cổng do nền tảng cung cấp; mặc định `3001`.
- `DATABASE_URL`: chuỗi kết nối TiDB/MySQL dùng riêng cho worker; TiDB Cloud phải bật TLS.
- `WORKER_ENABLED`: đặt `true` để supervisor chạy worker cùng Socket.IO.

Worker mặc định chạy một job, lease 90 giây và heartbeat 20 giây. Có thể điều chỉnh bằng
`JOB_CONCURRENCY`, `JOB_LEASE_MS`, `JOB_HEARTBEAT_MS`, `JOB_POLL_MS` và
`JOB_IDLE_POLL_MS`. Giữ `JOB_CONCURRENCY=1` cho giai đoạn đầu để không làm nghẽn
CPU/RAM của realtime service.

Ứng dụng Next.js cần cấu hình:

- `SOCKET_SERVER_URL=https://realtime.example.com`
- `NEXT_PUBLIC_SOCKET_SERVER_URL=https://realtime.example.com`
- `INTERNAL_SECRET_TOKEN` phải trùng với realtime server.

## Docker

Build context phải là thư mục `socket-server`:

```bash
docker build -t web-novel-realtime .
docker run --env-file .env -p 3001:3001 web-novel-realtime
```

Nền tảng cần hỗ trợ WebSocket, sticky session nếu chạy nhiều instance, và health check tại `/healthz`. Endpoint readiness là `/readyz`.

Container chạy Socket.IO và background worker thành hai process riêng. Nếu một process
thoát bất thường, supervisor kết thúc container để Render khởi động lại cả hai.

Sau khi triển khai, xác nhận:

1. `GET https://realtime.example.com/healthz` trả `status: ok`.
2. Browser kết nối Socket.IO bằng cookie production.
3. Next.js gọi `/api/trigger-notification` thành công qua secret nội bộ.
4. `ALLOWED_ORIGINS` chỉ chứa các origin web được tin cậy.
5. Admin gọi `POST /api/admin/background-jobs/diagnostics`, sau đó đọc job tại
   `GET /api/admin/background-jobs/{jobId}` và nhận trạng thái `completed`.

Sau khi enqueue, Next.js gọi `/api/internal/jobs/wake` bằng `INTERNAL_SECRET_TOKEN`.
Endpoint này giúp đánh thức Render; TiDB vẫn giữ job nếu wake request timeout hoặc service
đang deploy lại.

Yjs hiện lưu tài liệu trong bộ nhớ process. Không tăng quá 1 instance cho collaborative editor cho đến khi bổ sung Redis/shared document persistence.
