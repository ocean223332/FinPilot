# FinPilot

FinPilot giúp chủ shop online trả lời: **“Nhập hàng hôm nay có khiến tôi thiếu tiền trả lương, thuê mặt bằng hoặc nhà cung cấp không?”** Ứng dụng dự báo dòng tiền theo ngày từ tiền khả dụng đã xác nhận và các khoản thu/chi còn lại, với kỳ dự báo tối đa 56 ngày.

Backend dùng ASP.NET Core Web API .NET 10, EF Core 10 + Npgsql và PostgreSQL 17. Identity xác thực bằng cookie HttpOnly; frontend dùng React + TypeScript + Vite. ClosedXML và CsvHelper phục vụ import ở sprint sau.

Tiền VND dùng số nguyên `decimal` trong C#, `numeric(18,0)` trong database và **chuỗi JSON** như `"50000000"` khi qua API. Không làm tròn phần lẻ. Ngày nghiệp vụ dùng `DateOnly`.

## Yêu cầu

- .NET SDK **10.0.401** theo `global.json`.
- Node.js **22** và npm.
- Docker Desktop / Docker Compose để chạy PostgreSQL, hoặc PostgreSQL 17 đã cài riêng.

## Chạy môi trường phát triển

Các lệnh dưới đây chạy từ thư mục gốc repo, trong PowerShell.

### 1. PostgreSQL

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
```

Compose đọc `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` từ `.env`, dùng cổng `5432` và volume `finpilot_postgres_data`. Mật khẩu mẫu chỉ dành cho phát triển cục bộ; `.env` không được đưa vào git.

### 2. API và schema

ASP.NET Core tự đọc user-secrets trong Development, không tự đọc `.env`. Cấu hình một lần với mật khẩu giống `POSTGRES_PASSWORD` trong `.env`:

```powershell
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5432;Database=finpilot;Username=finpilot_dev;Password=<same as .env>" --project backend/src/FinPilot.Api
dotnet tool restore
dotnet restore backend/FinPilot.slnx
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet ef database update --project backend/src/FinPilot.Api
dotnet run --project backend/src/FinPilot.Api --launch-profile http
```

Thay `<same as .env>` bằng mật khẩu phát triển của bạn. User-secrets lưu ngoài repo; `appsettings.Development.json` chỉ chứa địa chỉ, database và username khớp `.env.example`, không chứa mật khẩu. Production cần cấp `ConnectionStrings__Default` qua cấu hình triển khai; thiếu chuỗi kết nối sẽ báo lỗi ngay khi khởi động.

API chạy ở `http://localhost:5281`. `GET /api/health` trả `{"status":"ok"}` và không truy cập database. EF migrations quản lý schema; **không chạy đồng thời SQL tham chiếu** trong `database/reference/`. Migration đầu tiên tạo Identity và `finpilot.shops`; các bảng còn lại theo lộ trình trong [database/README.md](database/README.md).

### 3. Frontend

Mở terminal thứ hai:

```powershell
Set-Location frontend
npm ci
npm run dev
```

Vite proxy chuyển `/api` đến `http://localhost:5281`, giúp frontend gọi API cùng origin qua máy chủ phát triển.

## API hiện có

- `POST /api/forecast/preview`: nhận `ForecastInput`, trả `ForecastResult`; không yêu cầu đăng nhập và không truy cập database. Lỗi đầu vào trả `400 ValidationProblem`.
- `/api/auth/*`: các endpoint Identity. Login luôn dùng cookie, kể cả khi client không gửi `useCookies=true`; `/api/auth/refresh` bị vô hiệu hóa. Client không cần lưu bearer token. Cookie là HttpOnly, SameSite Strict, Secure ngoài Development; lỗi xác thực/phân quyền trả 401/403.
- `GET /api/health`: kiểm tra tiến trình API.

Ví dụ payload preview:

```json
{
  "openingCash": "50000000",
  "start": "2026-01-01",
  "horizonDays": 56,
  "events": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "direction": "Out",
      "amount": "30000000",
      "date": "2026-01-01",
      "label": "Nhập hàng"
    }
  ]
}
```

**F07:** bảo vệ CSRF cho các thao tác có cookie còn chờ triển khai, được đánh dấu trong `Program.cs`.

## Build và kiểm tra

```powershell
dotnet build backend/FinPilot.slnx
dotnet test backend/FinPilot.slnx
npm --prefix frontend ci
npm --prefix frontend run build
```

CI chạy build/test backend và `npm ci` + build frontend với Node 22.

## Hosting pilot cùng origin

Build frontend rồi sao chép nội dung `frontend/dist/` vào `backend/src/FinPilot.Api/wwwroot/` trước khi publish API. ASP.NET phục vụ file tĩnh và fallback về `index.html` cho các tuyến SPA. File build không được đưa vào git.

## Cấu trúc repo

```text
backend/
  FinPilot.slnx
  src/FinPilot.Api/       API, Identity, EF model và migrations
  src/FinPilot.Engine/    Bộ máy dự báo thuần C#
  tests/FinPilot.Engine.Tests/
frontend/                React + TypeScript + Vite
database/
  reference/             SQL thiết kế, không áp dụng trực tiếp
dotnet-tools.json         Công cụ dotnet-ef cục bộ
.github/workflows/ci.yml  Build và test
docker-compose.yml       PostgreSQL cho phát triển
.env.example             Mẫu cấu hình Compose
global.json              SDK .NET
```
