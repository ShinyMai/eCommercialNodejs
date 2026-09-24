# eCommercial Node.js API

Backend Express 5 + TypeScript + MongoDB. Cấu hình được đọc tập trung từ
`src/configs/index.ts`; file `.env` cũ vẫn tương thích với các biến `DEV_*` và
`PROD_*`.

## Chạy dự án

```bash
npm install
copy .env.example .env
npm run dev
```

Kiểm tra và chạy production:

```bash
npm run check
npm start
```

Server chỉ bắt đầu lắng nghe sau khi kết nối MongoDB thành công. `SIGINT` và
`SIGTERM` đều đóng HTTP server và kết nối database an toàn.

## API

Prefix mặc định: `/v1/api` (có thể đổi bằng `API_PREFIX`).

| Method | Endpoint | Quyền | Mô tả |
| --- | --- | --- | --- |
| GET | `/health` | Công khai | Health check |
| POST | `/keys` | Bootstrap key ở production | Tạo API key |
| POST | `/auth/signup` | API key | Đăng ký và nhận access token |
| POST | `/auth/login` | API key | Đăng nhập |
| POST | `/auth/refresh-token` | API key | Rotate refresh token |
| POST | `/auth/logout` | API key + access token | Đăng xuất |
| GET | `/products?search=&page=1&limit=20&sort=newest` | `READ` | Danh sách/search sản phẩm published |
| GET | `/products/shop?status=draft&page=1&limit=20` | `READ` + access token | Sản phẩm của shop; status là `draft`, `published`, hoặc `all` |
| POST | `/products` | `WRITE` + access token | Tạo sản phẩm |
| PATCH | `/products/publication` | `WRITE` + access token | Publish/unpublish nhiều sản phẩm |

Các API có access token nhận hai header:

```text
x-client-id: <shop id>
Authorization: Bearer <access token>
```

Payload của API publication đã gom chung:

```json
{
  "productIds": ["<product id>"],
  "isPublished": true
}
```

Refresh token được rotate và lưu trong cookie `httpOnly`, giới hạn đúng path
`/v1/api/auth`. Client cũng có thể gửi token trong body `refreshToken`.

## Cấu hình chính

- `MONGODB_URI`: ưu tiên cao nhất; nếu không có sẽ dựng URI từ `DB_*` hoặc biến
  `DEV_DB_*`/`PROD_DB_*` cũ.
- `APP_PORT`, `API_PREFIX`, `JSON_BODY_LIMIT`, `TRUST_PROXY`.
- `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `RSA_MODULUS_LENGTH`.
- `API_KEY_BOOTSTRAP_SECRET`: bắt buộc khi tạo API key ở production.
- `LOG_LEVEL`, `LOG_DIRECTORY`, `LOG_FILES_ENABLED`.

Không commit `.env`, `dist`, hoặc file log runtime.
