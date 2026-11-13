using System.ComponentModel.DataAnnotations;

namespace FinPilot.Api.Shops;

public sealed record ProductInput
{
    [Required, StringLength(48), RegularExpression(@"[A-Za-z0-9][A-Za-z0-9._-]*")] public required string Sku { get; init; }
    [Required, StringLength(150)] public required string Name { get; init; }
    [Required, StringLength(30)] public required string Unit { get; init; }
    [Range(0, 1_000_000)] public required int MinimumStock { get; init; }
}

public sealed record StockLineInput
{
    public required Guid ProductId { get; init; }
    [Range(1, 1_000_000)] public required int Quantity { get; init; }
    [Range(typeof(decimal), "0", Limits.MaxMoney)] public required decimal UnitPrice { get; init; }
}

public sealed record StockDocumentInput
{
    [Required, RegularExpression("^(receipt|sale|adjustment|stock-out)$")] public required string Kind { get; init; }
    public required DateOnly Date { get; init; }
    public DateOnly? PaymentDue { get; init; }
    [Required(AllowEmptyStrings = true), StringLength(150)] public required string Counterparty { get; init; }
    [Required(AllowEmptyStrings = true), StringLength(500)] public required string Note { get; init; }
    [Required, MinLength(1), MaxLength(50)] public required StockLineInput[] Lines { get; init; }
}

public sealed record ProductView(Guid Id, string Sku, string Name, string Unit, int MinimumStock, long Stock);
public sealed record StockLineView(Guid ProductId, string Sku, string ProductName, string Unit, int Quantity, decimal UnitPrice);
public sealed record StockDocumentView(Guid Id, string Kind, DateOnly Date, DateOnly? PaymentDue, string Counterparty,
    string Note, DateTimeOffset? CancelledAt, Guid? ObligationId, decimal Total, StockLineView[] Lines);
public sealed record InventoryView(ProductView[] Products, StockDocumentView[] Documents);
public sealed record SalesDay(DateOnly Date, decimal Revenue, int Documents);
public sealed record ProductSales(Guid ProductId, string Sku, string Name, string Unit, long Quantity, decimal Revenue);
public sealed record SalesReport(decimal Revenue, int Documents, decimal Purchases, SalesDay[] Days, ProductSales[] Products);
