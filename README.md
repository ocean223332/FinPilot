# FinPilot

FinPilot giúp chủ shop online trả lời: **“Nhập hàng hôm nay có khiến tôi thiếu tiền trả lương, thuê mặt bằng hoặc nhà cung cấp không?”** Ứng dụng dự báo dòng tiền theo ngày từ tiền khả dụng đã xác nhận và các khoản thu/chi còn lại, với kỳ dự báo tối đa 56 ngày.

Backend dùng ASP.NET Core Web API .NET 10, EF Core 10 + Npgsql và PostgreSQL 17. Identity xác thực bằng cookie HttpOnly; frontend dùng React + TypeScript + Vite. ClosedXML và CsvHelper phục vụ import ở sprint sau.

Sản phẩm, nghiên cứu, lộ trình và việc tuần 6: [docs/](docs/README.md).

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

API chạy ở `http://localhost:5281`. `GET /api/health` trả `{"status":"ok"}` và không truy cập database. EF migrations quản lý schema; **không chạy đồng thời SQL tham chiếu** trong `database/reference/`. Migrations tạo Identity và các bảng dữ liệu shop, thanh toán, import, kịch bản và audit; chi tiết trong [database/README.md](database/README.md).

### 3. Frontend

Mở terminal thứ hai:

```powershell
Set-Location frontend
npm ci
npm run dev
```

Vite proxy chuyển `/api` đến `http://localhost:5281`, giúp frontend gọi API cùng origin qua máy chủ phát triển.

## Kho hàng và doanh thu

- Mở **Kho hàng** để tạo sản phẩm với mã SKU, đơn vị và ngưỡng tồn thấp. Ghi **Nhập tồn đầu / tăng tồn** để đưa hàng có sẵn vào hệ thống.
- **Nhập hàng** tăng tồn. **Xuất bán** giảm tồn và ghi nhận doanh thu theo ngày chứng từ. **Xuất khác / giảm tồn** dùng cho hao hụt hoặc xuất nội bộ. Số lượng là số nguyên theo đơn vị đã chọn.
- Phiếu nhập hoặc xuất bán có thể tạo khoản dự kiến thu–chi nếu điền ngày thanh toán. Ghi nhận thanh toán thực tế ở **Lịch thu–chi**. Khi hủy phiếu, hệ thống hoàn lại số lượng và gỡ khoản thu–chi liên kết nếu chưa thanh toán.
- **Báo cáo doanh thu** lọc theo khoảng ngày, tổng hợp doanh thu bán hàng, số phiếu bán, giá trị nhập hàng, doanh thu theo ngày và theo sản phẩm. Doanh thu ghi nhận theo phiếu bán còn hiệu lực, gồm cả phần chưa thu tiền. Giá trị nhập hàng là tổng phiếu nhập trong kỳ.

Áp dụng migration bằng `dotnet ef database update --project backend/src/FinPilot.Api` trước khi chạy API với bản có kho hàng.

## API hiện có

- `POST /api/forecast/preview`: nhận `ForecastInput`, trả `ForecastResult`; không yêu cầu đăng nhập và không truy cập database. Lỗi đầu vào trả `400 ValidationProblem`.
- `/api/auth/*`: các endpoint Identity. Login luôn dùng cookie, kể cả khi client không gửi `useCookies=true`; `/api/auth/refresh` bị vô hiệu hóa. Client không cần lưu bearer token. Cookie là HttpOnly, SameSite Strict, Secure ngoài Development; lỗi xác thực/phân quyền trả 401/403.
- `GET /api/csrf`: lấy `{ token }` và cookie antiforgery; gửi token trong header `X-CSRF-TOKEN` cho mọi POST/PUT/DELETE/PATCH dưới `/api`. Chỉ preview forecast, preview import và template được miễn. Login, register, forgotPassword và resetPassword cũng cần token. Lấy lại token sau login/logout.
- `GET /api/auth/me`: `{ email }` hoặc 401; `POST /api/auth/logout`: đăng xuất cookie, trả 204.
- `POST /api/auth/forgotPassword` `{ email }` và `POST /api/auth/resetPassword` `{ email, resetCode, newPassword }`: Identity gửi link khôi phục cho email đã xác nhận. Đăng ký gửi link xác nhận email tới trang `/confirm-email` của frontend, trang này gọi `GET /api/auth/confirmEmail` với nguyên query; `POST /api/auth/resendConfirmationEmail` `{ email }` gửi lại. forgotPassword không tiết lộ tài khoản có tồn tại hay chưa.
- `/api/shop`: tất cả yêu cầu đăng nhập. GET trả ShopData (version, balance, obligations với payments, scenarios, imports) cùng name/dataVersion; chưa tạo shop trả 404 ProblemDetails có type kết thúc `no-shop`. POST `{ name }` tạo shop duy nhất, trả 409 nếu đã có.
- `PUT /api/shop/balance`, `PUT /api/shop/obligations/{id}`, `DELETE /api/shop/obligations/{id}`, `PUT /api/shop/scenarios/{id}`, `DELETE /api/shop/scenarios/{id}`: mỗi thao tác trả toàn bộ shop mới. ID nghĩa vụ/kịch bản là GUID client tạo. Thanh toán bị loại khỏi danh sách được VOID, lịch sử được giữ; tổng thanh toán không vượt số tiền nghĩa vụ. Kịch bản không sửa nghĩa vụ thực tế.
- `POST /api/shop/imports` `{ fileSha256, fileName, obligations }`: commit nguyên tử; hash đã nhập trả 409 với `committedAt`. `PUT /api/shop/data` nhận ShopData để thay toàn bộ (demo/wipe); dữ liệu cũ được giữ theo quy tắc lịch sử và ghi audit.
- `GET /api/import/template?format=xlsx|csv` và `POST /api/import/preview` (multipart trường file): xem trước stateless, không cần đăng nhập. Mẫu và parser hỗ trợ CSV/XLSX.
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

### Email và khôi phục mật khẩu

Cấu hình qua user-secrets trong Development hoặc biến môi trường khi triển khai; không đưa thông tin SMTP vào repo:

| Khóa cấu hình | Biến môi trường | Ý nghĩa |
| --- | --- | --- |
| `App:PublicBaseUrl` | `App__PublicBaseUrl` | URL frontend công khai; HTTPS trong Production, Development mặc định http://localhost:5173 |
| `Smtp:Host` | `Smtp__Host` | Máy chủ SMTP |
| `Smtp:Port` | `Smtp__Port` | Cổng, mặc định 587 |
| `Smtp:UseStartTls` | `Smtp__UseStartTls` | STARTTLS, mặc định true (không phải implicit TLS cổng 465) |
| `Smtp:Username` | `Smtp__Username` | Tài khoản SMTP, bỏ trống nếu relay không cần đăng nhập |
| `Smtp:Password` | `Smtp__Password` | Mật khẩu SMTP |
| `Smtp:From` | `Smtp__From` | Địa chỉ người gửi |

Ví dụ: `dotnet user-secrets set "Smtp:Host" "smtp.example.com" --project backend/src/FinPilot.Api`; thiết lập các khóa còn lại theo nhà cung cấp. Link khôi phục là `{App:PublicBaseUrl}/reset-password?email=...&code=...`; frontend gửi code đó dưới tên resetCode đến Identity. Link xác nhận là `{App:PublicBaseUrl}/confirm-email?userId=...&code=...` (thêm `changedEmail` khi đổi email).

Thiếu Host/From hợp lệ trong Development: API cảnh báo và ghi link vào log thay vì gửi email. Log phát triển có token nhạy cảm. Production từ chối khởi động nếu SMTP hoặc PublicBaseUrl chưa cấu hình. Identity chỉ gửi reset cho email đã xác nhận.

Mỗi lần gửi mail bị giới hạn 20 giây; gửi lỗi hoặc quá hạn thì ghi log (không ghi link/mã) và đăng ký, gửi lại xác nhận, quên mật khẩu vẫn trả kết quả bình thường. Mail lỗi không tự gửi lại; người dùng yêu cầu lại từ giao diện.

Người gửi `@gmail.com` qua relay bên thứ ba không đạt SPF/DKIM cho gmail.com nên Gmail thường xếp vào Thư rác; giao diện nhắc người dùng xem mục này. Muốn vào hộp thư chính cần tên miền riêng đã cấu hình SPF/DKIM/DMARC tại nhà cung cấp gửi mail.

## Build và kiểm tra

```powershell
dotnet build backend/FinPilot.slnx
dotnet test backend/FinPilot.slnx
npm --prefix frontend ci
npm --prefix frontend run build
```

Tùy chọn `FINPILOT_TEST_POSTGRES` trỏ tới PostgreSQL 17 riêng cho test (tài khoản quản trị để tạo/xóa database và role tạm); suite chạy API bằng role chủ bảng không có superuser/BYPASSRLS. Nếu không đặt biến này, Testcontainers là mặc định.

CI Ubuntu dùng Docker có sẵn cho PostgreSQL test; đồng thời chạy `npm ci` + build frontend với Node 22.

## Triển khai

Frontend ở Vercel, API Docker ở Render, PostgreSQL ở Supabase; chọn Singapore cho Render và Supabase. Trình duyệt chỉ gọi URL Vercel: rewrite `/api/*` chuyển đến Render, giữ cookie HttpOnly/SameSite Strict và CSRF cùng origin. Frontend đã dùng URL tương đối và `credentials: 'same-origin'`, không cần sửa mã hay thêm biến môi trường frontend/CORS.

### 1. Tạo database Supabase

Trong Supabase chọn **New project**, vùng **Southeast Asia (Singapore)**, đặt và lưu mật khẩu database. Mở **Connect → Session pooler**, chọn chuỗi kết nối IPv4, cổng **5432**. Giữ nguyên host và username có project ref do dashboard cấp; không dùng Transaction pooler cổng 6543. Direct connection mặc định chỉ có IPv6, Render không kết nối được nếu chưa mua IPv4 add-on.

Chuỗi Npgsql cho API và EF migrations:

```text
Host=<session-pooler-host>;Port=5432;Database=postgres;Username=postgres.<project-ref>;Password=<database-password>;SSL Mode=Require;Trust Server Certificate=true
```

`Require` mã hóa đường truyền; cấu hình trên không xác minh chứng chỉ máy chủ. Nếu dùng chứng chỉ CA do Supabase cấp, dùng `SSL Mode=VerifyFull;Root Certificate=<đường-dẫn-CA>` thay hai tùy chọn SSL trên và cấp cùng file CA cho môi trường chạy. Dùng cùng tài khoản chủ bảng để chạy migration và API; Supabase anon/service-role API keys không phải mật khẩu PostgreSQL.

### 2. Tạo API Render

Trong Render chọn **New → Blueprint**, kết nối repo qua tài khoản GitHub (không dán URL repo công khai: kiểu đó Render không tự triển khai khi có commit mới) và nhánh chứa `render.yaml`, rồi **Apply**. Blueprint chọn Dockerfile ở gốc repo, vùng Singapore, gói Free và health check `/api/health`; container chạy non-root và đọc `$PORT` do Render cấp. Điền các giá trị được hỏi (`sync: false`), hoặc sửa tại **Service → Environment**:

| Biến Render | Giá trị |
| --- | --- |
| `ConnectionStrings__Default` | Chuỗi Npgsql Session pooler ở bước 1 |
| `App__PublicBaseUrl` | `https://<ten-project>.vercel.app` dự kiến; cập nhật URL thật sau bước 3, không có dấu `/` cuối |
| `Smtp__Host`, `Smtp__Port`, `Smtp__UseStartTls` | SMTP thật, STARTTLS `true`. Render Free chặn kết nối ra cổng 25/465/587 ([changelog](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)), nên dùng relay có cổng `2525`; hiện là Mailjet `in-v3.mailjet.com:2525`, Username/Password là API key/Secret key |
| `Smtp__Username`, `Smtp__Password`, `Smtp__From` | Tài khoản, mật khẩu và địa chỉ gửi đã được nhà cung cấp SMTP cho phép |

`ASPNETCORE_ENVIRONMENT=Production` đã có trong blueprint. Lưu hostname Render, ví dụ `finpilot-api-xxxx.onrender.com`. Không bật tự chạy migration lúc khởi động; hoàn thành bước 4 trước khi sử dụng API.

### 3. Tạo frontend Vercel

Thay `REPLACE_WITH_RENDER_HOST.onrender.com` trong **`frontend/vercel.json`** bằng hostname Render thật, giữ `https://` và `/api/:path*`, rồi đưa thay đổi lên nhánh triển khai. Placeholder này là cấu hình trong file, không được Vercel thay bằng biến môi trường.

Trong Vercel chọn **Add New → Project → Import** repo, chọn **Root Directory = `frontend`**, **Framework Preset = Vite**, build `npm run build`, output `dist`, Node.js **22.x**, rồi **Deploy**. Không cấp connection string, SMTP hoặc Supabase keys cho Vercel. Rewrite API đứng trước fallback SPA; `/reset-password` và đường dẫn có hash đều tải được ứng dụng. Nếu bật Deployment Protection, cho phép người dùng pilot truy cập URL production.

Sao chép URL production Vercel về `App__PublicBaseUrl` trên Render rồi **Save, rebuild, and deploy**. Khi thêm domain riêng, cập nhật URL này và triển khai lại API.

### 4. Áp dụng migrations và tắt Data API

Trên máy phát triển có .NET SDK theo `global.json`, chạy từ gốc repo. Nhập connection string kín thay vì ghi mật khẩu vào lịch sử lệnh hoặc file:

```powershell
$secret = Read-Host 'Supabase Npgsql connection string' -AsSecureString
$env:ConnectionStrings__Default = [System.Net.NetworkCredential]::new('', $secret).Password
try {
    dotnet tool restore
    dotnet ef migrations list --project backend/src/FinPilot.Api
    dotnet ef database update --project backend/src/FinPilot.Api
} finally {
    Remove-Item Env:ConnectionStrings__Default
    Remove-Variable secret
}
```

Migration tạo cả `public.DataProtectionKeys`: giữ nguyên bảng này và application name `FinPilot` qua các lần deploy để cookie, CSRF và link Identity còn hiệu lực. Khóa lưu trong database, không phụ thuộc ổ đĩa tạm Render. Migration cũng bật RLS, không có policy, cho toàn bộ bảng ứng dụng ở `public` và `finpilot` (kể cả bảng khóa và lịch sử EF); không FORCE RLS nên chủ bảng vẫn truy cập được. View số dư dùng `security_invoker` để không vượt RLS. API tiếp tục chịu trách nhiệm cách ly người dùng theo shop.

Trong Supabase mở **Project Settings → Data API → Enable Data API**, tắt và lưu vì ứng dụng không dùng PostgREST. Không cung cấp anon/service-role key cho frontend.

Mở `https://<vercel-host>/api/health`, đăng ký tài khoản, bấm link xác nhận email, đăng nhập, tạo shop và thử khôi phục mật khẩu. Cả link xác nhận và link đặt lại mật khẩu đều trỏ frontend theo `App__PublicBaseUrl`. [Vercel external rewrites](https://vercel.com/docs/rewrites) gửi `X-Forwarded-Host` và `X-Forwarded-Proto=https`; API xử lý cả hai trước HTTPS redirection, nên cookie có cờ Secure.

Production hiện tại: frontend `https://finpilot-ruby.vercel.app`, API Render `finpilot-api` (health check `/api/health`), Supabase vùng Singapore. Vercel tự triển khai mỗi commit lên `main`; Render được job `deploy-api` trong CI gọi qua deploy hook (secret Actions `RENDER_DEPLOY_HOOK`, lấy ở Render **Settings → Deploy Hook**) sau khi CI của `main` đạt. Render Free ngủ sau 15 phút không có request; request đầu tiên sau đó mất khoảng một phút.

### 5. Sao lưu và thử khôi phục

Supabase Free không có bản backup tải xuống. Trong GitHub repo mở **Settings → Secrets and variables → Actions → New repository secret**, tạo:

- `SUPABASE_DB_URL`: URI PostgreSQL **Session pooler** từ bước 1, dạng `postgresql://postgres.<project-ref>:<url-encoded-password>@<session-pooler-host>:5432/postgres?sslmode=require`. Phải URL-encode ký tự đặc biệt trong mật khẩu; đây không phải chuỗi Npgsql.
- `BACKUP_PASSPHRASE`: mật khẩu ngẫu nhiên dài, một dòng, dùng mã hóa GPG AES256. **Giữ một bản trong trình quản lý mật khẩu bên ngoài GitHub** để còn khôi phục khi mất quyền repo.

Workflow `Database backup` chạy lúc 03:00 giờ Việt Nam hằng ngày trên nhánh mặc định. Mở **Actions → Database backup → Run workflow**, chờ thành công, tải artifact `finpilot-db-<run-id>` và giải nén lấy `finpilot.dump.gpg`. Chỉ file đã mã hóa được upload, giữ **7 ngày**; thiếu secret thì workflow thất bại. Repo public nên không được upload dump rõ. Theo dõi lần chạy lỗi; lịch GitHub có thể trễ và bị tắt sau thời gian repo public không hoạt động. Tải bản mã hóa ra nơi lưu độc lập nếu cần giữ lâu hơn.

Dump dùng định dạng custom, chỉ chứa schema `public` và `finpilot`, gồm Identity, shop, Data Protection keys và lịch sử migrations; không sao lưu các dịch vụ Supabase Auth/Storage không dùng. Workflow dùng client PostgreSQL 17; khi nâng major PostgreSQL, nâng image `postgres:17` tương ứng vì `pg_dump` không hỗ trợ server major mới hơn nó.

Để thử khôi phục trên PostgreSQL 17 cục bộ/portable, cài GPG (ví dụ Gpg4win), đưa GPG và PostgreSQL `bin` vào PATH. Ví dụ PowerShell, chỉ tạo database thử mới; không dùng database đang phục vụ pilot:

```powershell
gpg --output finpilot.dump --decrypt finpilot.dump.gpg # GPG hỏi passphrase, không đặt trên dòng lệnh
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '55432' # hoặc cổng PostgreSQL cục bộ của bạn
$env:PGUSER = 'fp_test' # role cục bộ có quyền CREATE DATABASE; dùng prompt/pgpass nếu có mật khẩu
$restoreDb = 'finpilot_restore_' + [guid]::NewGuid().ToString('N')
createdb $restoreDb
if ($LASTEXITCODE -ne 0) { throw 'Không tạo được database thử mới' }
psql --dbname $restoreDb -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public;' # bỏ schema rỗng mặc định; dump sẽ tạo lại
if ($LASTEXITCODE -ne 0) { throw 'Không chuẩn bị được database thử' }
pg_restore --exit-on-error --no-owner --no-privileges --dbname $restoreDb finpilot.dump
if ($LASTEXITCODE -ne 0) { throw 'Khôi phục thất bại' }
psql --dbname $restoreDb -c 'SELECT count(*) FROM finpilot.shops;'
psql --dbname $restoreDb -c 'SELECT count(*) FROM finpilot.obligations;'
```

Mọi lệnh phải thành công. Đối chiếu số shop, nghĩa vụ và giá trị tiền với dữ liệu nguồn tại thời điểm dump; trỏ API phát triển vào database thử bằng `ConnectionStrings__Default` để kiểm tra tài khoản và dữ liệu đã phục hồi. Sau khi dừng API thử: `dropdb $restoreDb`, xóa dump đã giải mã và gỡ các biến môi trường thử. Không chạy `--clean` hoặc restore đè database pilot. Mã dump → mã hóa → giải mã → `pg_restore` đã được thử trên PostgreSQL portable 17; phải lặp lại bằng artifact Supabase thật sau khi cấu hình secrets.

Render Free ngủ khi không có truy cập, lần gọi đầu có thể chờ khoảng **1 phút**. Supabase Free có thể tạm dừng project không hoạt động và có giới hạn dung lượng/kết nối; GitHub Actions/artifact cũng có hạn mức và không bảo đảm lịch sao lưu. Chọn gói trả phí nếu pilot cần luôn sẵn sàng hoặc thời gian khôi phục có cam kết.

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
