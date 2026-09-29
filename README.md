# eCommercial Node.js API

Backend Express 5 + TypeScript + MongoDB. Cấu hình được đọc tập trung từ
`src/configs/index.ts` và dùng chung một bộ biến môi trường cho mọi môi trường
triển khai.

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

## Dữ liệu mặc định cho development

Sau khi clone repo và cấu hình `.env`, tạo hoặc cập nhật bộ dữ liệu mẫu bằng:

```bash
npm run db:seed
```

Seed sử dụng ID cố định nên có thể chạy lại an toàn. Bộ dữ liệu gồm 4 account,
4 user profile, 5 sản phẩm, 5 inventory và 8 discount bao phủ cả happy path lẫn
các trạng thái inactive, future, expired, exhausted và already-used. Collection
`auth_sessions` được tạo index nhưng để trống; session thật sẽ được tạo khi login.

| Role | Email | Password mặc định |
| --- | --- | --- |
| Admin | `admin@example.com` | `ChangeMe123!` |
| Seller | `seller@example.com` | `ChangeMe123!` |
| Seller | `seller2@example.com` | `ChangeMe123!` |
| Buyer | `buyer@example.com` | `ChangeMe123!` |

Có thể đổi password chung bằng `SEED_DEFAULT_PASSWORD` trong `.env`. Script seed
và reset đều bị chặn khi `NODE_ENV=production`.

Để xóa **toàn bộ database hiện tại**, bao gồm collection legacy, rồi seed lại,
phải xác nhận đúng tên database đang kết nối:

```powershell
$env:RESET_DATABASE_CONFIRM="ecommerceDEV"
npm run db:reset
```

Thay `ecommerceDEV` bằng database trong `MONGODB_URI`. Cơ chế xác nhận theo đúng
tên database giúp tránh reset nhầm; các database hệ thống `admin`, `config` và
`local` luôn bị từ chối.

## API

Prefix mặc định: `/v1/api` (có thể đổi bằng `API_PREFIX`).

| Method | Endpoint | Quyền | Mô tả |
| --- | --- | --- | --- |
| GET | `/health` | Công khai | Health check |
| POST | `/auth/signup` | Công khai | Đăng ký buyer |
| POST | `/auth/register/seller` | Công khai | Gửi đăng ký seller; account ở trạng thái `pending`, không cấp token |
| POST | `/auth/login` | Công khai | Đăng nhập |
| POST | `/auth/refresh-token` | Refresh token | Rotate refresh token và phát hiện replay |
| POST | `/auth/logout` | Buyer+ | Đăng xuất |
| GET | `/accounts/me` | Buyer+ | Account hiện tại kèm user profile |
| PATCH | `/accounts/me/profile` | Buyer+ | Cập nhật user profile; seller có thể cập nhật seller profile |
| GET | `/accounts?role=&status=&page=&limit=` | Admin | Danh sách account |
| PATCH | `/accounts/:id/role` | Admin | Thay đổi role |
| PATCH | `/accounts/:id/approve-seller` | Admin | Duyệt đăng ký seller đang chờ |
| PATCH | `/accounts/:id/status` | Admin | Khóa/mở account |
| GET | `/products?search=&page=1&limit=20&sort=newest` | Công khai | Danh sách/search sản phẩm published |
| GET | `/products/seller?status=draft&page=1&limit=20` | Seller+ | Sản phẩm của seller; status là `draft`, `published`, hoặc `all` |
| POST | `/products` | Seller+ | Tạo sản phẩm |
| PATCH | `/products/publication` | Seller+ | Publish/unpublish nhiều sản phẩm |
| GET | `/discounts?sellerId=&productId=&page=1&limit=20` | Công khai | Danh sách mã giảm giá |
| POST | `/discounts/:id/calculate` | Buyer+ | Tính số tiền giảm cho giỏ hàng |
| POST | `/discounts` | Seller+ | Tạo mã giảm giá |
| PATCH | `/discounts/:id` | Seller+ | Cập nhật mã giảm giá |
| PATCH | `/discounts/:id/cancel` | Seller+ | Hủy mã giảm giá |
| DELETE | `/discounts/:id` | Seller+ | Xóa mềm mã giảm giá |

## Account, UserProfile và phân quyền

Thông tin đăng nhập và thông tin con người được tách thành hai model có quan hệ
1-1:

- `Account` (`accounts`): chỉ giữ `email`, password hash, `role`, `status` và
  trạng thái xác minh. Đây là identity dùng cho authentication, authorization,
  session và ownership của dữ liệu nghiệp vụ.
- `UserProfile` (`user_profiles`): giữ `name`, `avatarUrl`, `phone` và
  `sellerProfile`. Field `account` là unique reference đến `Account`.

Sản phẩm, tồn kho và mã giảm giá tham chiếu account ID của seller, không tham
chiếu profile ID. Mỗi account có đúng một role:

- `buyer`: chức năng mua hàng và hồ sơ cá nhân.
- `seller`: kế thừa toàn bộ quyền buyer, đồng thời quản lý sản phẩm, tồn kho và mã giảm giá.
- `admin`: quyền quản trị toàn hệ thống và kế thừa mọi mức quyền thấp hơn.

Role được đọc lại từ `accounts` trên mỗi request authenticated, không lấy từ
input của client hoặc tin vào role cũ trong JWT. Public signup không thể tạo
admin. Profile của seller có thêm object `sellerProfile` chứa `storeName` và
`description`. Seller đăng ký qua `/auth/register/seller`; account mới có trạng
thái `pending`, không nhận access/refresh token và không thể đăng nhập cho đến
khi admin duyệt qua `/accounts/:id/approve-seller`.

Các API có access token chỉ nhận header:

```text
Authorization: Bearer <access token>
```

Payload của API publication đã gom chung:

```json
{
  "productIds": ["<product id>"],
  "isPublished": true
}
```

Payload tính tiền giảm giá:

```json
{
  "sellerId": "<seller id>",
  "products": [
    { "productId": "<product id>", "quantity": 2 }
  ]
}
```

Refresh token là opaque random token, được rotate và lưu trong cookie `httpOnly`,
giới hạn đúng path `/v1/api/auth`. Database chỉ lưu SHA-256 hash của token.
Client không dùng cookie vẫn có thể gửi token trong body `refreshToken`.

Access token là JWT ngắn hạn và luôn chứa `tokenUse=access`, `sub` (account ID),
`sid` (session ID), `iss`, `aud`, `jti`. Middleware kiểm cả token, session đang hoạt
động, trạng thái account và role hiện tại. Mỗi lần đăng nhập tạo một session độc lập nên hỗ trợ nhiều
thiết bị; logout chỉ thu hồi session hiện tại.

> Lưu ý nâng cấp: kiến trúc session mới dùng collection `auth_sessions`. Các token
> được tạo bởi phiên bản cũ sẽ không còn hợp lệ sau khi deploy. Sau khi xác nhận
> phiên bản mới hoạt động, hãy xóa collection legacy `keys` vì collection này từng
> chứa refresh token và private key dạng plaintext.

API key đã được loại bỏ khỏi hệ thống. Nếu database cũ có collection `apiKeys`,
có thể xóa collection này sau khi deploy phiên bản mới.

## Migration từ Shop/User sang Account + UserProfile

Sao lưu database trước, sau đó chạy migration một lần:

```powershell
$env:MIGRATION_CONFIRM="yes"
npm run migrate:accounts
```

Migration đọc cả collection `shops` cũ và collection `users` trung gian, giữ
nguyên `_id` khi tạo `accounts`, rồi tách thông tin cá nhân sang `user_profiles`.
Mọi shop cũ trở thành seller; các field owner `product_shop`, `inven_shopId`,
`discount_shopId` được đổi sang tên `*_seller*`, còn session được đổi reference
từ `user` sang `account`. Script có thể chạy lại an toàn. Chỉ xóa các collection
legacy sau khi đã đối soát dữ liệu và tạo bản sao lưu.

Admin không được tạo qua HTTP. Tạo admin đầu tiên bằng script:

```powershell
$env:ADMIN_NAME="System Admin"
$env:ADMIN_EMAIL="admin@example.com"
$env:ADMIN_PASSWORD="replace-with-a-strong-password"
npm run create:admin
```

Tất cả API dùng chung một response envelope. Dữ liệu trả về nằm trong
`metadata.items`; API danh sách có thêm `metadata.pagination`:

```json
{
  "statusCode": 200,
  "message": "Products retrieved successfully",
  "metadata": {
    "items": [],
    "pagination": { "page": 1, "limit": 20 }
  },
  "requestId": "request-id",
  "timestamp": "2026-09-28T00:00:00.000Z"
}
```

Khi có lỗi, `metadata.items` là `null` và `statusCode` khớp với HTTP status.

## Cấu hình chính

- `MONGODB_URI`: ưu tiên cao nhất; nếu không có sẽ dựng URI từ các biến `DB_*`.
- `APP_PORT`, `API_PREFIX`, `JSON_BODY_LIMIT`, `TRUST_PROXY`.
- `ACCESS_TOKEN_TTL`, `ACCESS_TOKEN_ISSUER`, `ACCESS_TOKEN_AUDIENCE`.
- `ACCESS_TOKEN_SECRET`: bắt buộc, tối thiểu 32 ký tự ở production.
- `REFRESH_COOKIE_MAX_AGE_MS`, `REFRESH_TOKEN_HISTORY_LIMIT`.
- `AUTH_*_RATE_WINDOW_MS`, `AUTH_*_RATE_MAX`: giới hạn signup/login/refresh.
- `LOG_LEVEL`, `LOG_DIRECTORY`, `LOG_FILES_ENABLED`.

Ở production, `MONGODB_URI` và `ACCESS_TOKEN_SECRET` phải được cấu hình rõ ràng;
ứng dụng sẽ fail-fast nếu thiếu.
Rate limiter mặc định lưu trong memory của từng process; khi chạy nhiều instance,
nên thay store bằng Redis hoặc áp dụng rate limit tại API gateway.

Không commit `.env`, `dist`, hoặc file log runtime.
