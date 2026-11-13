using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace FinPilot.Api.Tests;

public sealed class InventoryTests(ShopFixture fixture) : IClassFixture<ShopFixture>
{
    private static readonly string Date = "2026-01-02";
    private static string ProductUrl(Guid id) => $"/api/shop/inventory/products/{id}";
    private static string DocumentUrl(Guid id) => $"/api/shop/inventory/documents/{id}";

    [Fact]
    public async Task SaleIsIdempotentAndCancellationReversesStockRevenueAndReceivable()
    {
        using var client = await fixture.Account();
        var product = await AddProduct(client, "DRINK-01");
        var receipt = Guid.NewGuid();
        var sale = Guid.NewGuid();
        (await client.PutAsJsonAsync(DocumentUrl(receipt), Document("receipt", product, 10, "10000"))).EnsureSuccessStatusCode();
        var order = Document("sale", product, 3, "15000", Date);
        (await client.PutAsJsonAsync(DocumentUrl(sale), order)).EnsureSuccessStatusCode();
        (await client.PutAsJsonAsync(DocumentUrl(sale), order)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(DocumentUrl(sale), Document("sale", product, 2, "15000", Date))).StatusCode);
        Assert.Equal(7, await Stock(client, product));

        var report = await Report(client);
        Assert.Equal("45000", report["revenue"]!.GetValue<string>());
        Assert.Equal("100000", report["purchases"]!.GetValue<string>());
        Assert.Equal(1, report["documents"]!.GetValue<int>());

        var shop = await client.GetFromJsonAsync<JsonObject>("/api/shop");
        var receivable = Assert.Single(shop!["obligations"]!.AsArray())!.AsObject();
        Assert.Equal("45000", receivable["amount"]!.GetValue<string>());
        Assert.Equal("In", receivable["direction"]!.GetValue<string>());
        var receivableId = receivable["id"]!.GetValue<string>();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.DeleteAsync($"/api/shop/obligations/{receivableId}")).StatusCode);

        receivable["payments"] = new JsonArray(new JsonObject { ["id"] = Guid.NewGuid().ToString(), ["amount"] = "10000", ["date"] = Date });
        (await client.PutAsJsonAsync($"/api/shop/obligations/{receivableId}", receivable)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsync(DocumentUrl(sale) + "/cancel", null)).StatusCode);
        Assert.Equal(7, await Stock(client, product));

        receivable["payments"] = new JsonArray();
        (await client.PutAsJsonAsync($"/api/shop/obligations/{receivableId}", receivable)).EnsureSuccessStatusCode();
        (await client.PostAsync(DocumentUrl(sale) + "/cancel", null)).EnsureSuccessStatusCode();
        (await client.PostAsync(DocumentUrl(sale) + "/cancel", null)).EnsureSuccessStatusCode();
        Assert.Equal(10, await Stock(client, product));
        Assert.Equal("0", (await Report(client))["revenue"]!.GetValue<string>());
        shop = await client.GetFromJsonAsync<JsonObject>("/api/shop");
        Assert.Empty(shop!["obligations"]!.AsArray());
    }

    [Fact]
    public async Task ConcurrentSalesCannotOversellAndAnotherShopCannotUseTheProduct()
    {
        using var client = await fixture.Account();
        using var other = await fixture.Account();
        var product = await AddProduct(client, "BOOK-01");
        var receipt = Guid.NewGuid();
        (await client.PutAsJsonAsync(DocumentUrl(receipt), Document("receipt", product, 5, "10000"))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await other.PutAsJsonAsync(DocumentUrl(Guid.NewGuid()), Document("sale", product, 1, "10000"))).StatusCode);

        var orders = await Task.WhenAll(
            client.PutAsJsonAsync(DocumentUrl(Guid.NewGuid()), Document("sale", product, 4, "15000")),
            client.PutAsJsonAsync(DocumentUrl(Guid.NewGuid()), Document("sale", product, 4, "15000")));
        Assert.Single(orders, response => response.IsSuccessStatusCode);
        Assert.Single(orders, response => response.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(1, await Stock(client, product));
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsync(DocumentUrl(receipt) + "/cancel", null)).StatusCode);
        Assert.Equal(1, await Stock(client, product));
        Assert.Equal("60000", (await Report(client))["revenue"]!.GetValue<string>());
        Assert.Equal("0", (await Report(other))["revenue"]!.GetValue<string>());
    }

    private static async Task<Guid> AddProduct(HttpClient client, string sku)
    {
        var id = Guid.NewGuid();
        (await client.PutAsJsonAsync(ProductUrl(id), new { sku, name = "Product", unit = "box", minimumStock = 2 })).EnsureSuccessStatusCode();
        return id;
    }

    private static object Document(string kind, Guid productId, int quantity, string unitPrice, string? paymentDue = null) =>
        new { kind, date = Date, paymentDue, counterparty = "", note = "", lines = new[] { new { productId, quantity, unitPrice } } };

    private static async Task<long> Stock(HttpClient client, Guid id)
    {
        var inventory = (await client.GetFromJsonAsync<JsonObject>("/api/shop/inventory"))!;
        return inventory["products"]!.AsArray().Single(x => Guid.Parse(x!["id"]!.GetValue<string>()) == id)!["stock"]!.GetValue<long>();
    }

    private static async Task<JsonObject> Report(HttpClient client) =>
        (await client.GetFromJsonAsync<JsonObject>($"/api/shop/reports/sales?from={Date}&to={Date}"))!;
}
