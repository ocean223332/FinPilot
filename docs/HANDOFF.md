# FinPilot: Handoff cho supervisor kế tiếp

> Cập nhật: 2026-10-06 ~16:45 (giờ máy). Người viết: supervisor `flute` (Piggery, template `opus-gpt-sonnet`).
> Đọc file này trước, sau đó đọc `README.md` và `database/README.md`.

---

## 1. Dự án là gì

FinPilot là một app web giúp **chủ shop thời trang online** trả lời câu hỏi: *"Nếu nhập lô hàng này hôm nay, đến ngày phải trả lương, tiền thuê hay nhà cung cấp thì shop có bị thiếu tiền không? Thiếu vào ngày nào và thiếu bao nhiêu?"*

Phạm vi MVP gồm 3 phần, làm theo thứ tự:
1. Nhập lịch thu/chi.
2. Dự báo số dư theo ngày và cảnh báo thiếu tiền.
3. Mô phỏng các phương án nhập hàng: nhập ngay, nhập ít hơn, nhập muộn hơn, chia đợt, tiền về trễ.

Health Score, AI, đồng bộ ngân hàng **không** thuộc MVP.

### Nguồn tài liệu (Google Drive)

| Tài liệu | Drive ID | Bản local |
|---|---|---|
| Nội Dung App Tài Chính FINPILOT (spec, MVP, kế hoạch 6 tuần, **tiêu chí nghiệm thu**) | `15zNcbk9-WNWljd6ZMER_2oJJvR8atx0xFF4IEpJ3EIA` (Google Doc) | không có, đọc bằng Drive MCP `read_file_content` |
| NOTE IDEA EXE101 (ghi chú ý tưởng, **chưa đọc**) | `1dpmfahNslK-vE8ReWLNiRva9MN_eAgMg4fWrDKYfgEY` | không có |
| công nghệ và stack | `1LsZxZijFUQf0FYxB5satRqRGwgEzZJrCrqbuQGYM0Ag` | không có |
| finpilot_schema_postgresql.sql | `1x1s-W4Hy3JgX0Qv7awKmYpIalgfkw-nl` | `D:\_finpilot_dl\schema.sql` = `database/reference/finpilot_schema_postgresql.sql` (SHA-256 `0EF477…C0C5`) |
| FinPilot_MVP_Project_Plan.xlsm (Sprint Plan, Backlog F01–F37, Database, Setup Checklist) | `14xSZGMdUczNS4QNY9a1p_fxx_t5-O0Fe` | `D:\_finpilot_dl\plan.xlsm` |

Thư mục Drive gốc: EXE101 `1aS3BhC0e3ot4SdStqN-ComOR3LurHYFJ` → con `1iVQnkClRLQe6OpOmQcjwVK7G83A0aR0l`, và thư mục `15HRpYugmOsAcmwwKVFgYWB0H_qo_8SNR`.

**Stack đã chốt:** React + Vite + TypeScript · Tailwind + shadcn/ui · Recharts · ASP.NET Core Web API **.NET 10** · PostgreSQL · EF Core 10 + Npgsql 10 · ASP.NET Core Identity (cookie) · ClosedXML + CsvHelper · xUnit + Playwright.

---

## 2. Trạng thái hiện tại

Repo nằm ở `D:\FinPilot`. Git đã `init` trên nhánh `main` nhưng **chưa có commit nào**: mọi file đều đang untracked. Người dùng chưa yêu cầu commit, vì vậy hãy **hỏi trước khi commit**.

### Đã xong và đã kiểm tra

| Phần | Nội dung | Cách kiểm tra |
|---|---|---|
| Toolchain | Cài .NET SDK 10.0.401 qua winget; `global.json` pin 10.0.401 (`rollForward: latestFeature`) | `dotnet --list-sdks` |
| Backend | `backend/FinPilot.slnx` gồm 3 project: `FinPilot.Api`, `FinPilot.Engine` (C# thuần, không phụ thuộc EF hay HTTP), `FinPilot.Engine.Tests` (xUnit) | `dotnet build backend/FinPilot.slnx` → 0 lỗi, 0 cảnh báo |
| Engine | `CashForecaster.Run`: số dư theo ngày, tách riêng event quá hạn (`UnresolvedEvents`, không tự dời ngày) và event ngoài kỳ, cờ `HasIntradayTimingRisk`, từ chối VND có số lẻ | 6 test nghiệm thu (xem mục 3) |
| API | JSON camelCase; tiền đi dưới dạng **chuỗi** VND nguyên; enum `"In"/"Out"`. Endpoint: `POST /api/forecast/preview` (anonymous, stateless), `GET /api/health`, `/api/auth/*` (Identity, chỉ dùng cookie, `/refresh` trả 404) | curl: health 200; tiền gửi dạng số → 400; `"1000.5"` → 400; không có Bearer challenge |
| DB | `docker-compose.yml` (postgres:17); migration `20261006092202_InitialIdentityAndShops` **đã áp** vào DB local: các bảng Identity + `finpilot.shops` | `psql \d finpilot.shops`: có PK, unique owner, FK RESTRICT tới `AspNetUsers`, 3 CHECK |
| Frontend | Màn hình "Kiểm tra nhập hàng": form có sẵn ca 50/30/25/35, biểu đồ Recharts (phần âm tô đỏ), 3 thẻ tóm tắt, bảng 56 ngày, đủ các trạng thái loading/error/empty/stale | `npm run build` và `npm run lint` đều qua; worker đã kiểm tra bằng mock trên Edge ở 5 cỡ màn hình |
| Repo | `README.md` (tiếng Việt), `.gitignore`, `.editorconfig`, `.env.example`, `.github/workflows/ci.yml`, `dotnet-tools.json` (dotnet-ef), `database/README.md` | `git check-ignore .env` |

### Kết quả test hiện tại

`dotnet test backend/FinPilot.slnx` → **6/6 pass**.

---

## 3. Tiêu chí nghiệm thu (lấy từ spec, đã mã hóa thành test)

Các ngày là ngày tương đối. Snapshot 50tr ở ngày −1, tức tiền đầu ngày 0 là 50tr.

1. Chi 30 ngày 0, chi 25 ngày 7, thu 35 ngày 14 → số dư cuối ngày 0/7/14 = **20 / −5 / 30 tr**. Ngày thiếu đầu tiên là ngày 7, thiếu tối đa 5tr.
2. Chia đợt: chi 20 ngày 0 + 10 ngày 15 → ngày 0/7/14/15 = **30 / 5 / 40 / 30 tr**, không thiếu. Số dư thấp nhất rơi vào ngày 7.
3. Giống ca 2 nhưng khoản thu 35 dời sang ngày 16 → **ngày 15 thiếu 5tr**.
4. Khoản 10tr đã trả 4tr thì nghĩa vụ còn lại 6tr. Không trừ lại các khoản đã nằm trong snapshot. Ca này **thuộc Week 3**, chưa có test.
5. Bảo mật: shop A không được đọc, sửa hay xóa dữ liệu của shop B. Ca này **thuộc Week 3–5**.

---

## 4. Các quyết định đã chốt (đừng lật lại nếu không có lý do mới)

- **EF migrations là chủ của schema.** File SQL trong `database/reference/` chỉ dùng làm thiết kế tham chiếu. **Không bao giờ** áp cả SQL lẫn migration vào cùng một DB.
- **Bảng nào thêm vào sprint nào** (theo sheet Database của plan):
  - W1 F05: Identity, cùng thiết kế 9 bảng.
  - W2 F09/F10: `shops`, `balance_snapshots`, `obligations`.
  - W3: F14 `cash_transactions` (kèm view `obligation_balances`), F16 `audit_logs`, F17/F18 `import_batches` và `import_rows`.
  - W4 F21/F22: `scenarios`, `scenario_adjustments`.
  - `shops` đã được scaffold sớm.
- **Tiền:** C# `decimal`, DB `numeric(18,0)` (convention trong `AppDbContext`), JSON là chuỗi. Gặp số lẻ thì **từ chối, không làm tròn**. Phía frontend không tính toán tiền bằng JS number; `formatVnd` dùng BigInt, còn `Number()` chỉ dùng để vẽ biểu đồ.
- **Ngày nghiệp vụ** dùng `DateOnly`; timestamp dùng UTC `timestamptz`.
- **Auth:** chỉ dùng cookie.
  - Login bị ép `useCookies=true` bằng endpoint filter, `/refresh` trả 404.
  - Default authenticate/challenge/forbid scheme = `IdentityConstants.ApplicationScheme`.
  - Cookie HttpOnly, SameSite Strict. Secure dùng `SameAsRequest` trong Development, `Always` ở môi trường khác.
  - Không lưu token trong localStorage.
  - **Chưa có CSRF**: đã đánh dấu comment `F07:` trong `Program.cs`.
- **Secrets:** API đọc connection string từ **dotnet user-secrets** (đã set trên máy này). docker-compose đọc `.env` (đã gitignore). Thiếu connection string thì API dừng ngay khi khởi động.
- **Forecast preview** là `[AllowAnonymous]` và stateless, chỉ phục vụ vertical slice Week 2 trước khi có dữ liệu lưu trong DB.
- **Event có ngày trước `Start`** được giữ ở trạng thái *unresolved*: không được tính, không tự dời ngày. Đây là yêu cầu của spec.
- Đã kiểm tra shadcn CLI v4 chạy được với Vite 8 / TS 6. Style `radix-vega`, màu neutral, font Inter.

---

## 5. Piggery team

- **Team:** `FinPilot`, **gốc tại `D:\FinPilot`**. Template `opus-gpt-sonnet`. Team `\` đã đóng.
- **Gate / supervisor:** `creek`.
- **Worker:** `backend` (executor).
- **Luật đã giao cho worker**, nên giữ nguyên:
  - Không commit.
  - Không bật, tắt hay xóa container hoặc volume Docker; đó là việc của supervisor.
  - Chỉ kill tiến trình theo PID do chính worker tạo. Worker `web` từng chạy `taskkill /IM node.exe` và đã bị nhắc.
  - Muốn tạo tài khoản test Identity thì phải xin. Một smoke script tạo/xóa tài khoản đã bị policy chặn; việc kiểm tra cookie end-to-end hoãn tới F07.
- Người dùng chọn cách làm qua Piggery: họ đã từ chối để supervisor tự viết file code và hỏi "Không setup piggery à". Vì vậy hãy **giao việc code qua worker**, supervisor chỉ lập kế hoạch và kiểm tra lại kết quả.

---

## 6. Tiến trình đang chạy trên máy

| Thứ | Cổng | PID / tên | Dừng bằng |
|---|---|---|---|
| PostgreSQL 17 (container `finpilot-postgres-1`, volume `finpilot_finpilot_postgres_data`) | 5432 | Docker | `docker compose stop` (trong `D:\FinPilot`) |
| API (`dotnet run --launch-profile http`) | 5281 | PID **23684** | `taskkill /PID 23684 /T /F` |
| Vite dev server | 5173 | PID **25480** | `taskkill /PID 25480 /T /F` |

API và Vite được chạy nền để người dùng xem UI. PID sẽ đổi nếu chúng được khởi động lại; kiểm tra bằng `netstat -ano | findstr LISTENING`. Docker Desktop phải đang chạy thì Postgres mới lên.

DB: database `finpilot`, user `finpilot_dev`, mật khẩu nằm trong `D:\FinPilot\.env` (chỉ dùng local).

---

## 7. Nợ kỹ thuật và hạn chế đã biết

1. `MapFallbackToFile("index.html")` đang bắt cả `/api/*` gõ sai, trả về 200 HTML thay vì 404. Sửa khi ghép SPA vào backend (F13/F30).
2. CSRF/antiforgery chưa có (F07). Việc phát cookie login end-to-end cũng chưa được kiểm tra.
3. Bundle JS 748 kB (229 kB gzip), Vite có cảnh báo. Chưa cần chia nhỏ.
4. Date picker hiển thị theo locale của trình duyệt; trình duyệt en-US sẽ hiện mm/dd/yyyy.
5. UI chưa được thử với API thật, cũng chưa thử trên Firefox/Safari hay với screen reader.
6. Tiền đầu kỳ chỉ nhận giá trị ≥ 0. Spec cho rằng số dư thực tế không âm; nếu sau này cần âm thì phải đổi cả API.
7. Script kiểm tra và ảnh chụp của worker `web` nằm **ngoài repo**: `C:\Users\Admin\AppData\Local\Temp\fp-verify`, `...\Temp\fp-shot`. Playwright e2e chính thức thuộc F28 (Week 5).
8. Tài liệu "NOTE IDEA EXE101" chưa được đọc.

---

## 8. Bước tiếp theo đề xuất (theo Backlog trong plan)

Week 1 phần IT gần xong: F04 đã xong, F05 xong một phần. Các bước tiếp:

1. **Hỏi người dùng có muốn commit lần đầu không** (nhánh `main`, chưa có remote).
2. **Week 2:**
   - **F07** Identity cookie và đăng ký/đăng nhập, kèm CSRF, giao cho executor.
   - **F08** UI login và tạo shop, giao cho frontend.
   - **F09** API cho balance snapshot (append-only, có revision, con trỏ `current_snapshot_id`).
   - **F10** API cho obligations IN/OUT.
   - **F11** form nhập liệu.
   - **F13** nối forecast với dữ liệu lưu trong DB.

   Ranh giới giữa hai worker là **hợp đồng API**: chốt DTO trước rồi giao song song.
3. Mỗi task nên có tiêu chí nghiệm thu cụ thể, bám theo cột *Acceptance Criteria* của sheet Backlog trong `plan.xlsm`.

Quy tắc tuần cần giữ (từ spec mục 7): mỗi tuần demo một luồng chạy được; không thêm tính năng ngoài phạm vi; nếu thiếu thời gian thì cắt animation và UI phụ trước, **không** cắt test tiền, đối soát hay cách ly dữ liệu giữa các shop.
