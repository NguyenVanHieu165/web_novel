# Web Novel Realtime Server

Socket.IO phải chạy trên một dịch vụ Node.js duy trì kết nối lâu dài; không triển khai chung vào Vercel Functions.

## Biến môi trường bắt buộc

- `JWT_SECRET`: giống ứng dụng Next.js để xác thực cookie phiên.
- `INTERNAL_SECRET_TOKEN`: secret riêng dùng giữa Next.js và realtime server.
- `ALLOWED_ORIGINS`: URL production của web, phân tách bằng dấu phẩy nếu có nhiều origin.
- `INTERNAL_API_URL`: URL HTTPS production của ứng dụng Next.js, ví dụ `https://example.com`.
- `PORT`: cổng do nền tảng cung cấp; mặc định `3001`.

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

Sau khi triển khai, xác nhận:

1. `GET https://realtime.example.com/healthz` trả `status: ok`.
2. Browser kết nối Socket.IO bằng cookie production.
3. Next.js gọi `/api/trigger-notification` thành công qua secret nội bộ.
4. `ALLOWED_ORIGINS` chỉ chứa các origin web được tin cậy.

Yjs hiện lưu tài liệu trong bộ nhớ process. Không tăng quá 1 instance cho collaborative editor cho đến khi bổ sung Redis/shared document persistence.
