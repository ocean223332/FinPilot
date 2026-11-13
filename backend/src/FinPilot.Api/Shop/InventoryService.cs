using System.Data;
using System.Globalization;
using FinPilot.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace FinPilot.Api.Shops;

public sealed partial class ShopService
{
    public async Task<InventoryView> Inventory(string owner, DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        CheckPeriod(from, to);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var shopId = await InventoryShopId(owner, ct);
        var products = await db.Set<Product>().Where(x => x.ShopId == shopId).AsNoTracking()
            .OrderBy(x => x.Sku).Select(x => new ProductView(x.Id, x.Sku, x.Name, x.Unit, x.MinimumStock, x.Stock)).ToArrayAsync(ct);
        var documents = await Documents(shopId, from, to).OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt)
            .Include(x => x.Lines).ToArrayAsync(ct);
        await transaction.CommitAsync(ct);
        return new(products, documents.Select(View).ToArray());
    }

    public Task<ShopResponse> SaveProduct(string owner, Guid id, ProductInput input, CancellationToken ct) =>
        Write(owner, "upsert", "product", id, async shop =>
        {
            Validate(input);
            if (id == Guid.Empty) throw Invalid("Mã định danh sản phẩm không hợp lệ.");
            var sku = input.Sku.ToUpperInvariant();
            var products = db.Set<Product>();
            var product = await products.SingleOrDefaultAsync(x => x.Id == id, ct);
            if (product is not null && product.ShopId != shop.Id) throw Missing();
            if (await products.AnyAsync(x => x.ShopId == shop.Id && x.Sku == sku && x.Id != id, ct))
                throw new ShopProblem(409, "Mã hàng đã tồn tại.");
            if (product is null)
            {
                product = new Product { Id = id, ShopId = shop.Id, Sku = sku, Name = input.Name.Trim(), Unit = input.Unit.Trim() };
                products.Add(product);
            }
            if (product.Unit != input.Unit.Trim() && await db.Set<StockLine>().AnyAsync(x => x.ProductId == id && x.ShopId == shop.Id, ct))
                throw Invalid("Không thể đổi đơn vị tính khi sản phẩm đã có phiếu kho.");
            product.Sku = sku;
            product.Name = input.Name.Trim();
            product.Unit = input.Unit.Trim();
            product.MinimumStock = input.MinimumStock;
        }, ct);

    public Task<ShopResponse> PostStockDocument(string owner, Guid id, StockDocumentInput input, CancellationToken ct) =>
        Write(owner, "post", "stock-document", id, async shop =>
        {
            Validate(input);
            if (id == Guid.Empty || input.Date == default || input.Date > ShopToday(shop))
                throw Invalid("Ngày chứng từ phải là hôm nay hoặc một ngày đã qua.");
            var ids = input.Lines.Select(x => x.ProductId).ToArray();
            if (ids.Distinct().Count() != ids.Length)
                throw Invalid("Mỗi mã hàng chỉ được xuất hiện một lần trên phiếu.");
            if (input.Kind is "adjustment" or "stock-out" && (input.PaymentDue.HasValue || string.IsNullOrWhiteSpace(input.Note) ||
                input.Lines.Any(x => x.UnitPrice != 0)))
                throw Invalid("Phiếu điều chỉnh hoặc xuất khác cần lý do và không ghi nhận tiền.");
            if (input.PaymentDue < input.Date)
                throw Invalid("Ngày thanh toán không được trước ngày chứng từ.");

            var total = input.Lines.Sum(x => x.Quantity * x.UnitPrice);
            if (total > decimal.Parse(Limits.MaxMoney, CultureInfo.InvariantCulture) ||
                (input.PaymentDue.HasValue && total == 0))
                throw Invalid("Tổng tiền phiếu không hợp lệ.");

            var counterparty = input.Counterparty.Trim();
            var note = input.Note.Trim();
            var existing = await db.Set<StockDocument>().Include(x => x.Lines).SingleOrDefaultAsync(x => x.Id == id, ct);
            if (existing is not null)
            {
                if (existing.ShopId != shop.Id) throw Missing();
                var saved = existing.Lines.Select(x => new StockLineInput { ProductId = x.ProductId, Quantity = x.Quantity, UnitPrice = x.UnitPrice });
                if (existing.Kind == input.Kind && existing.Date == input.Date && existing.PaymentDue == input.PaymentDue &&
                    existing.Counterparty == counterparty && existing.Note == note &&
                    saved.OrderBy(x => x.ProductId).SequenceEqual(input.Lines.OrderBy(x => x.ProductId)))
                    return;
                throw new ShopProblem(409, "Mã phiếu này đã được sử dụng. Hãy tạo phiếu mới.");
            }

            var products = await db.Set<Product>().Where(x => x.ShopId == shop.Id && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            if (products.Count != ids.Length) throw new ShopProblem(404, "Có sản phẩm không thuộc kho của shop.");
            var document = new StockDocument
            {
                Id = id, ShopId = shop.Id, Kind = input.Kind, Date = input.Date, PaymentDue = input.PaymentDue,
                Counterparty = counterparty, Note = note, CreatedAt = DateTimeOffset.UtcNow
            };
            foreach (var line in input.Lines)
            {
                var product = products[line.ProductId];
                UpdateStock(product, StockSign(input.Kind) * line.Quantity);
                document.Lines.Add(new StockLine
                {
                    ShopId = shop.Id, ProductId = product.Id, Sku = product.Sku, ProductName = product.Name,
                    Unit = product.Unit, Quantity = line.Quantity, UnitPrice = line.UnitPrice
                });
            }
            if (input.PaymentDue is DateOnly due)
            {
                var obligationId = Guid.NewGuid();
                await UpsertObligation(shop, new ObligationInput
                {
                    Id = obligationId, Direction = input.Kind == "sale" ? "In" : "Out", Amount = total,
                    Label = (input.Kind == "sale" ? "Tiền bán hàng" : "Tiền nhập hàng") +
                        (counterparty.Length == 0 ? "" : $" · {counterparty}"),
                    Date = due, Note = note, Status = "open", Payments = []
                }, ct);
                document.ObligationId = obligationId;
            }
            db.Set<StockDocument>().Add(document);
        }, ct);

    public Task<ShopResponse> CancelStockDocument(string owner, Guid id, CancellationToken ct) =>
        Write(owner, "cancel", "stock-document", id, async shop =>
        {
            var document = await db.Set<StockDocument>().Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.Id == id && x.ShopId == shop.Id, ct) ?? throw Missing();
            if (document.CancelledAt.HasValue) return;
            if (document.ObligationId is Guid linked)
            {
                if (await db.CashTransactions.AnyAsync(x => x.ShopId == shop.Id && x.ObligationId == linked && x.VoidedAt == null, ct))
                    throw new ShopProblem(409, "Phiếu đã ghi nhận thanh toán. Hãy đối chiếu và điều chỉnh thanh toán trước khi hủy.");
                var obligation = await db.Obligations.SingleAsync(x => x.Id == linked && x.ShopId == shop.Id, ct);
                await RemoveObligation(shop, obligation, ct);
            }
            var ids = document.Lines.Select(x => x.ProductId).ToArray();
            var products = await db.Set<Product>().Where(x => x.ShopId == shop.Id && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            foreach (var line in document.Lines)
                UpdateStock(products[line.ProductId], -StockSign(document.Kind) * line.Quantity);
            document.CancelledAt = DateTimeOffset.UtcNow;
        }, ct);

    public async Task<SalesReport> ReportSales(string owner, DateOnly from, DateOnly to, CancellationToken ct)
    {
        CheckPeriod(from, to);
        var shopId = await InventoryShopId(owner, ct);
        var documents = await Documents(shopId, from, to)
            .Where(x => x.CancelledAt == null && (x.Kind == "sale" || x.Kind == "receipt"))
            .OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt)
            .Include(x => x.Lines).ToArrayAsync(ct);
        var sales = documents.Where(x => x.Kind == "sale").ToArray();
        return new(
            sales.Sum(Total), sales.Length, documents.Where(x => x.Kind == "receipt").Sum(Total),
            sales.GroupBy(x => x.Date).OrderBy(x => x.Key).Select(x => new SalesDay(x.Key, x.Sum(Total), x.Count())).ToArray(),
            sales.SelectMany(x => x.Lines).GroupBy(x => x.ProductId).Select(x =>
            {
                var latest = x.First();
                return new ProductSales(x.Key, latest.Sku, latest.ProductName, latest.Unit, x.Sum(y => (long)y.Quantity),
                    x.Sum(y => y.Quantity * y.UnitPrice));
            }).OrderByDescending(x => x.Revenue).ThenBy(x => x.Sku).ToArray());
    }

    private async Task CheckStockObligationEdit(Guid shopId, ObligationInput input, CancellationToken ct)
    {
        var document = await db.Set<StockDocument>().AsNoTracking().Include(x => x.Lines)
            .SingleOrDefaultAsync(x => x.ShopId == shopId && x.ObligationId == input.Id, ct);
        if (document is null) return;
        if (document.CancelledAt.HasValue || input.Status == "cancelled" ||
            input.Direction != (document.Kind == "sale" ? "In" : "Out") ||
            input.Amount != Total(document) || input.Date < document.Date || input.ImportedFrom is not null ||
            input.Payments.Any(x => x.Date < document.Date))
            throw Invalid("Khoản liên kết với phiếu kho chỉ cho phép điều chỉnh lịch và ghi nhận thanh toán.");
    }

    private async Task<Guid> InventoryShopId(string owner, CancellationToken ct) =>
        await db.Shops.Where(x => x.OwnerUserId == owner).Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct) ?? throw NoShop();

    private IQueryable<StockDocument> Documents(Guid shopId, DateOnly? from, DateOnly? to) =>
        db.Set<StockDocument>().AsNoTracking().Where(x => x.ShopId == shopId &&
            (from == null || x.Date >= from) && (to == null || x.Date <= to));

    private static void CheckPeriod(DateOnly? from, DateOnly? to)
    {
        if (from == default(DateOnly) || to == default(DateOnly) || from > to)
            throw Invalid("Khoảng ngày không hợp lệ.");
    }

    private static DateOnly ShopToday(Domain.Shop shop) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTimeOffset.UtcNow, shop.TimeZone).DateTime);

    private static int StockSign(string kind) => kind is "sale" or "stock-out" ? -1 : 1;

    private static void UpdateStock(Product product, int delta)
    {
        if (product.Stock + delta < 0)
            throw new ShopProblem(409, $"Hàng {product.Sku} không đủ tồn. Hiện còn {product.Stock} {product.Unit}.");
        product.Stock += delta;
    }

    private static decimal Total(StockDocument document) => document.Lines.Sum(x => x.Quantity * x.UnitPrice);

    private static StockDocumentView View(StockDocument document) =>
        new(document.Id, document.Kind, document.Date, document.PaymentDue, document.Counterparty, document.Note,
            document.CancelledAt, document.ObligationId, Total(document),
            document.Lines.OrderBy(x => x.Sku).Select(x =>
                new StockLineView(x.ProductId, x.Sku, x.ProductName, x.Unit, x.Quantity, x.UnitPrice)).ToArray());
}
