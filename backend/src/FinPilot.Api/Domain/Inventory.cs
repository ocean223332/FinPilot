namespace FinPilot.Api.Domain;

public sealed class Product : ShopRecord
{
    public required string Sku { get; set; }
    public required string Name { get; set; }
    public required string Unit { get; set; }
    public int MinimumStock { get; set; }
    public long Stock { get; set; }
}

public sealed class StockDocument : ShopRecord
{
    public required string Kind { get; set; }
    public DateOnly Date { get; set; }
    public DateOnly? PaymentDue { get; set; }
    public required string Counterparty { get; set; }
    public required string Note { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }
    public Guid? ObligationId { get; set; }
    public List<StockLine> Lines { get; } = [];
}

public sealed class StockLine : ShopRecord
{
    public Guid DocumentId { get; set; }
    public Guid ProductId { get; set; }
    public required string Sku { get; set; }
    public required string ProductName { get; set; }
    public required string Unit { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
}
