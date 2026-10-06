# Thiết kế cơ sở dữ liệu FinPilot

`reference/finpilot_schema_postgresql.sql` là bản sao nguyên vẹn của thiết kế tham chiếu PostgreSQL cho MVP. **EF Core migrations là nguồn duy nhất quản lý schema của ứng dụng.** Không chạy trực tiếp SQL tham chiếu lên cơ sở dữ liệu đã dùng migrations.

Identity quản lý các bảng `AspNet*` trong schema `public`, với `AspNetUsers.Id` kiểu `text`. Chín bảng nghiệp vụ nằm trong schema `finpilot`; MVP có một chủ sở hữu cho mỗi shop và mỗi chủ sở hữu chỉ có một shop.

## Lộ trình tạo bảng

Tuần 1, F05: thiết kế đủ chín bảng và tạo nền tảng Identity. Migration `InitialIdentityAndShops` hiện tạo Identity và `shops` sớm để kiểm chứng khóa ngoại chủ sở hữu cùng các ràng buộc cơ bản.

| Bảng nghiệp vụ | Sprint / backlog triển khai |
| --- | --- |
| `shops` | Tuần 2, F09/F10; đã có trong migration nền tảng tuần 1 |
| `balance_snapshots` | Tuần 2, F09/F10 |
| `obligations` | Tuần 2, F09/F10 |
| `cash_transactions` | Tuần 3, F14 |
| `audit_logs` | Tuần 3, F16; cùng cập nhật `shops.data_version` |
| `import_batches` | Tuần 3, F17/F18 |
| `import_rows` | Tuần 3, F17/F18 |
| `scenarios` | Tuần 4, F21/F22 |
| `scenario_adjustments` | Tuần 4, F21/F22 |

View `obligation_balances` được bổ sung ở tuần 3 cùng `cash_transactions`, không phải bảng nghiệp vụ thứ mười. Khóa ngoại `shops.current_snapshot_id` được bổ sung khi có `balance_snapshots` ở tuần 2.

## Quy tắc cần giữ khi chuyển sang migrations

- Tiền VND dùng `decimal` / `numeric(18,0)`; API nhận và trả chuỗi JSON, từ chối phần lẻ trước khi PostgreSQL có thể làm tròn. Ngày nghiệp vụ dùng `DateOnly`, thời điểm kiểm toán dùng UTC.
- Giữ khóa ngoại tổ hợp để chặn liên kết khác shop, hướng thu/chi không khớp và nguồn import không đúng loại. API vẫn phải kiểm tra quyền sở hữu shop.
- Snapshot là số dư cuối ngày đã xác nhận; không tính lại giao dịch đã nằm trong snapshot. Số dư dự báo có thể âm.
- Các ghi tài chính dùng cùng khóa shop trong một transaction; cập nhật phiên bản dữ liệu và audit trong transaction đó. Hủy giao dịch bằng VOID; không xóa lịch sử.
- Scenario giữ baseline bất biến; import commit phải nguyên tử và có idempotency. Các CHECK, trigger, view và hợp đồng transaction chi tiết nằm trong SQL tham chiếu và phải được chuyển sang migration ở sprint tương ứng.

## Lệnh EF Core

Chạy từ thư mục gốc sau khi cấu hình kết nối theo README chính:

```powershell
dotnet tool restore
dotnet ef migrations list --no-connect --project backend/src/FinPilot.Api
```

Để cập nhật schema trên **cơ sở dữ liệu phát triển của bạn**, chọn duy nhất đường triển khai EF:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet ef database update --project backend/src/FinPilot.Api
```

Migration đầu tiên đã được kiểm chứng trên PostgreSQL phát triển cục bộ bằng EF; SQL tham chiếu không được áp dụng. Không có bước tự động áp dụng migration khi API khởi động.
