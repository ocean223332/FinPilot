using FinPilot.Api.Shops;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Mvc;

namespace FinPilot.Api.Controllers;

public sealed partial class ShopController
{
    [HttpGet("inventory")]
    public Task<InventoryView> Inventory([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct) =>
        service.Inventory(Owner, from, to, ct);

    [HttpPut("inventory/products/{id:guid}")]
    public Task<ShopResponse> SaveProduct(Guid id, ProductInput input, CancellationToken ct) =>
        service.SaveProduct(Owner, id, input, ct);

    [HttpPut("inventory/documents/{id:guid}")]
    public Task<ShopResponse> PostStockDocument(Guid id, StockDocumentInput input, CancellationToken ct) =>
        service.PostStockDocument(Owner, id, input, ct);

    [HttpPost("inventory/documents/{id:guid}/cancel")]
    public Task<ShopResponse> CancelStockDocument(Guid id, CancellationToken ct) =>
        service.CancelStockDocument(Owner, id, ct);

    [HttpGet("reports/sales")]
    public Task<SalesReport> ReportSales([FromQuery, BindRequired] DateOnly from, [FromQuery, BindRequired] DateOnly to, CancellationToken ct) =>
        service.ReportSales(Owner, from, to, ct);
}
