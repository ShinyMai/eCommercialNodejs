# eCommercial Node.js API

Backend thương mại điện tử nhiều người bán (multi-seller) viết bằng **Express 5 + TypeScript**,
lưu trữ trên **MongoDB** và dùng **Redis** cho distributed lock.

📘 **Tài liệu đầy đủ:** mở [`docs/index.html`](docs/index.html) bằng trình duyệt. Trang này
gồm kiến trúc, flow từng feature (có sơ đồ) và API reference với request/response mẫu cho
mọi endpoint.

## Tính năng

| Nhóm | Nội dung |
| --- | --- |
| Xác thực | Đăng ký buyer, đăng ký seller (chờ admin duyệt), login, JWT access token ngắn hạn, refresh token rotation có phát hiện token bị dùng lại, session đa thiết bị, rate limit |
| Phân quyền | 3 cấp `buyer < seller < admin`, role đọc lại từ DB ở mỗi request |
| Account | Hồ sơ cá nhân, hồ sơ cửa hàng; admin đổi role, khoá/mở khoá, duyệt seller |
| Sản phẩm | Tạo/sửa, draft ↔ published, full-text search, tự tạo inventory |
| Mã giảm giá | Theo từng seller: phần trăm hoặc số tiền cố định, toàn shop hoặc theo sản phẩm, giới hạn lượt dùng, giá trị đơn tối thiểu |
| Giỏ hàng | Thêm/sửa/xoá, kiểm tra tồn kho, optimistic concurrency |
| Checkout | Xem trước giá, mã giảm và phí ship theo từng shop |
| Đơn hàng | Tạo đơn idempotent theo `requestId`, giữ hàng 15 phút trong transaction, tự hết hạn, huỷ đơn hoàn kho |

Chưa có: thanh toán, trừ lượt dùng mã giảm giá, phí ship thật, địa chỉ giao hàng.

## Yêu cầu

- **Node.js 22+** (đang phát triển trên Node 24).
- **MongoDB chạy dạng replica set** (hoặc Atlas). Tạo và huỷ đơn dùng transaction;
  MongoDB standalone sẽ lỗi ở các endpoint `/orders`.
- **Redis**. Server không khởi động nếu không kết nối được Redis.

## Bắt đầu nhanh

```bash
npm install
copy .env.example .env      # macOS/Linux: cp .env.example .env
npm run db:seed
npm run dev
```

API chạy tại `http://localhost:3052/v1/api` (theo `APP_PORT` và `API_PREFIX` trong `.env`).
Kiểm tra bằng `GET /v1/api/health`.

Server chỉ bắt đầu nhận request sau khi đã kết nối Redis và MongoDB. Khi nhận `SIGINT`
hoặc `SIGTERM`, server ngừng nhận request, chờ job đang chạy xong rồi mới đóng kết nối
database.

## Scripts

| Lệnh | Mô tả |
| --- | --- |
| `npm run dev` | Chạy development, tự reload khi sửa code |
| `npm run build` | Biên dịch TypeScript ra `dist/` |
| `npm start` | Chạy bản build (`dist/server.js`) |
| `npm run typecheck` | Kiểm tra kiểu |
| `npm test` | Chạy toàn bộ test |
| `npm run check` | typecheck → test → build (nên chạy trước khi commit) |
| `npm run db:seed` | Tạo/cập nhật dữ liệu mẫu |
| `npm run db:reset` | Xoá toàn bộ database rồi seed lại (cần xác nhận, xem bên dưới) |
| `npm run create:admin` | Tạo tài khoản admin |

## Dữ liệu mẫu

`npm run db:seed` dùng ID cố định nên chạy lại nhiều lần vẫn an toàn. Bộ dữ liệu gồm
4 account, 5 sản phẩm kèm inventory và 8 mã giảm giá, bao phủ cả trường hợp bình thường lẫn
các trạng thái inactive, chưa bắt đầu, hết hạn, hết lượt và đã dùng.

| Role | Email | Mật khẩu |
| --- | --- | --- |
| Admin | `admin@example.com` | `ChangeMe123!` |
| Seller | `seller@example.com` | `ChangeMe123!` |
| Seller | `seller2@example.com` | `ChangeMe123!` |
| Buyer | `buyer@example.com` | `ChangeMe123!` |

Đổi mật khẩu chung bằng `SEED_DEFAULT_PASSWORD` (dài 12–72 byte). Seed và reset đều bị chặn khi
`NODE_ENV=production`.

**Reset database:** lệnh này xoá **toàn bộ** database đang kết nối, nên phải xác nhận
bằng đúng tên database. Các database hệ thống `admin`, `config`, `local` luôn bị từ chối.

```powershell
$env:RESET_DATABASE_CONFIRM="ecommerceDEV"
npm run db:reset
```

**Tạo admin:** không có API tạo admin, phải dùng script:

```powershell
$env:ADMIN_NAME="System Admin"
$env:ADMIN_EMAIL="admin@example.com"
$env:ADMIN_PASSWORD="replace-with-a-strong-password"
npm run create:admin
```

## Cấu hình

Mọi biến môi trường được đọc tập trung trong `src/configs/index.ts`. Xem đầy đủ trong
[`.env.example`](.env.example).

| Biến | Mặc định | Ghi chú |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` bật fail-fast cho secret và URI |
| `APP_PORT` | `3000` | `.env.example` dùng `3052` |
| `API_PREFIX` | `/v1/api` | |
| `MONGODB_URI` | dựng từ `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | **Bắt buộc ở production** |
| `REDIS_URL` | `redis://127.0.0.1:6379` | |
| `ACCESS_TOKEN_SECRET` | giá trị cho development | **Bắt buộc ở production**, tối thiểu 32 ký tự |
| `ACCESS_TOKEN_TTL` | `15m` | Thời hạn access token |
| `ACCESS_TOKEN_ISSUER` / `ACCESS_TOKEN_AUDIENCE` | `ecommerce-api` / `ecommerce-client` | |
| `REFRESH_COOKIE_MAX_AGE_MS` | 7 ngày | Thời hạn refresh token và session |
| `REFRESH_TOKEN_HISTORY_LIMIT` | `50` | Số token cũ được nhớ để phát hiện việc dùng lại |
| `BCRYPT_SALT_ROUNDS` | `10` | |
| `AUTH_{SIGNUP,LOGIN,REFRESH}_RATE_WINDOW_MS` / `_RATE_MAX` | 10/giờ, 20/15 phút, 60/15 phút | Rate limit theo IP |
| `JSON_BODY_LIMIT` | `1mb` | |
| `TRUST_PROXY` | `false` | Bật khi chạy sau reverse proxy để lấy đúng IP |
| `DB_DEBUG` | `true` khi không phải production | Log query Mongoose |
| `DB_MONITOR_INTERVAL_MS` | 5 phút | Chu kỳ log tình trạng kết nối |
| `LOG_LEVEL`, `LOG_DIRECTORY`, `LOG_FILES_ENABLED` | `debug`, `logs`, `false` (dev) | Ghi file log JSON khi bật |

## Cấu trúc thư mục

Request đi theo một chiều: `routes → middlewares → controllers → validators/services → repositories → models`.

```text
server.ts               Bootstrap: kết nối Redis/MongoDB, chạy jobs, graceful shutdown
src/
  app.ts                Khởi tạo Express và middleware toàn cục
  auth/                 JWT access token, refresh token, role hierarchy
  configs/              Đọc env tập trung, logger, kết nối MongoDB, Redis client
  constants/            HTTP status code / reason phrase
  core/                 Response envelope, error classes, chuẩn hoá lỗi hạ tầng
  helpers/              asyncHandler, logger theo request, request context
  middlewares/          authentication, authorization, rate limit, request ID, error handler
  routes/               Khai báo endpoint (<resource>.route.ts) và gắn middleware
  controllers/          Đọc HTTP request, gọi service, trả SuccessResponse
  validators/           Parse/validate payload thành dữ liệu đã chuẩn hoá
  services/             Nghiệp vụ: business rules, transaction, lock
  repositories/         Truy vấn MongoDB, dùng lại giữa các service
  models/               Mongoose schema + enum dùng chung
  jobs/                 Tác vụ nền: hết hạn reservation (30s), giám sát DB
  utils/                Hàm thuần: pagination, ObjectId, validate primitive, Mongo helpers
  types/                Kiểu dùng chung
docs/index.html         Kiến trúc, flow nghiệp vụ, API reference
scripts/                Seed, reset database, tạo admin
tests/
  helpers/              fakeQuery, fakeResponse, inventory giả trong bộ nhớ
  integration/          Gọi HTTP thật vào app (không cần DB)
  unit/<layer>/         Test theo đúng layer trong src/
```

Import nội bộ dùng alias `#/` (ví dụ `#/services/order.service.js`). Alias này trỏ tới
`src/` khi chạy development và tới `dist/src/` khi chạy bản build.

## API

Base URL: `/v1/api`. Mọi response, kể cả lỗi, có cùng một cấu trúc:

```json
{
  "statusCode": 200,
  "message": "Products retrieved successfully",
  "metadata": { "items": [], "pagination": { "page": 1, "limit": 20 } },
  "requestId": "c0ffee00-…",
  "timestamp": "2026-10-07T00:00:00.000Z"
}
```

Endpoint cần đăng nhập nhận header `Authorization: Bearer <accessToken>`.

| Nhóm | Endpoint |
| --- | --- |
| System | `GET /health` |
| Auth | `POST /auth/signup` · `POST /auth/register/seller` · `POST /auth/login` · `POST /auth/refresh-token` · `POST /auth/logout` |
| Accounts | `GET /accounts/me` · `PATCH /accounts/me/profile` · `GET /accounts` · `PATCH /accounts/:id/role` · `PATCH /accounts/:id/status` · `PATCH /accounts/:id/approve-seller` |
| Products | `GET /products` · `GET /products/seller` · `GET /products/:id` · `POST /products` · `PATCH /products/publication` · `PATCH /products/:id` |
| Discounts | `GET /discounts` · `POST /discounts/:id/calculate` · `POST /discounts` · `PATCH /discounts/:id` · `PATCH /discounts/:id/cancel` · `DELETE /discounts/:id` |
| Cart | `GET /cart` · `POST /cart/items` · `PATCH /cart/items/:productId` · `DELETE /cart/items/:productId` · `DELETE /cart` |
| Checkout | `POST /checkout/review` |
| Orders | `POST /orders` · `GET /orders/:orderId` · `POST /orders/:orderId/cancel` |

Quyền truy cập, payload, response mẫu và mã lỗi của từng endpoint có trong
[`docs/index.html`](docs/index.html#api).

## Testing

```bash
npm test
```

Test dùng `node:test`, tự nhận mọi file `tests/**/*.test.ts`. Các method của Mongoose model
và Redis client được mock, nên **không cần MongoDB/Redis thật** để chạy test. Bộ test hiện
có 111 test, bao gồm cả các kịch bản ghi đồng thời, idempotency và rollback khi đặt hàng.
Test tích hợp với MongoDB replica set và Redis thật hiện chưa có.

## Bảo mật & vận hành

- Mật khẩu được hash bằng bcrypt. Khi login với email không tồn tại, hệ thống vẫn so sánh
  với một hash giả để thời gian phản hồi không làm lộ email nào có tồn tại.
- Refresh token là chuỗi ngẫu nhiên, lưu trong cookie `httpOnly` giới hạn path
  `/v1/api/auth`; database chỉ lưu SHA-256 hash. Dùng lại token cũ sẽ thu hồi cả session.
- Lỗi 500 không trả chi tiết ra client; log đầy đủ stack kèm `requestId`.
- Rate limiter lưu trong memory của từng process. Khi chạy nhiều instance, hãy dùng store
  dùng chung (Redis) hoặc giới hạn tại API gateway.
- Không commit `.env`, `dist/` hoặc file log.

**Ghi chú nâng cấp từ phiên bản cũ:** session hiện lưu trong collection `auth_sessions`, nên
token tạo bởi phiên bản cũ không còn hợp lệ. Sau khi deploy ổn định, có thể xoá các
collection legacy `keys` (từng chứa refresh token và private key dạng plaintext) và `apiKeys`.
