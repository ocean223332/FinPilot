using FinPilot.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace FinPilot.Api.Data;

internal static class InventoryModel
{
    internal static void Configure(ModelBuilder builder)
    {
        const string schema = AppDbContext.BusinessSchema;
        builder.Entity<Product>(e =>
        {
            e.ToTable("products", schema, t => t.HasCheckConstraint("ck_products_stock", "\"Stock\" >= 0 AND \"MinimumStock\" >= 0"));
            e.HasAlternateKey(x => new { x.Id, x.ShopId });
            e.HasOne<Shop>().WithMany().HasForeignKey(x => x.ShopId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.ShopId, x.Sku }).IsUnique();
            e.Property(x => x.Sku).HasMaxLength(48);
            e.Property(x => x.Name).HasMaxLength(150);
            e.Property(x => x.Unit).HasMaxLength(30);
        });
        builder.Entity<StockDocument>(e =>
        {
            e.ToTable("stock_documents", schema, t =>
            {
                t.HasCheckConstraint("ck_stock_documents_kind", "\"Kind\" IN ('receipt', 'sale', 'adjustment', 'stock-out')");
                t.HasCheckConstraint("ck_stock_documents_due", "(\"PaymentDue\" IS NULL AND \"ObligationId\" IS NULL) OR (\"PaymentDue\" IS NOT NULL AND \"PaymentDue\" >= \"Date\" AND \"ObligationId\" IS NOT NULL AND \"Kind\" IN ('receipt', 'sale'))");
            });
            e.HasAlternateKey(x => new { x.Id, x.ShopId });
            e.HasOne<Shop>().WithMany().HasForeignKey(x => x.ShopId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Obligation>().WithMany().HasForeignKey(x => new { x.ObligationId, x.ShopId })
                .HasPrincipalKey(x => new { x.Id, x.ShopId }).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => x.ObligationId).IsUnique();
            e.HasIndex(x => new { x.ShopId, x.Date });
            e.Property(x => x.Kind).HasMaxLength(12);
            e.Property(x => x.Counterparty).HasMaxLength(150);
            e.Property(x => x.Note).HasMaxLength(500);
        });
        builder.Entity<StockLine>(e =>
        {
            e.ToTable("stock_lines", schema, t => t.HasCheckConstraint("ck_stock_lines_values",
                "\"Quantity\" > 0 AND \"UnitPrice\" >= 0 AND \"UnitPrice\" <> 'NaN'::numeric"));
            e.HasOne<StockDocument>().WithMany(x => x.Lines).HasForeignKey(x => new { x.DocumentId, x.ShopId })
                .HasPrincipalKey(x => new { x.Id, x.ShopId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Product>().WithMany().HasForeignKey(x => new { x.ProductId, x.ShopId })
                .HasPrincipalKey(x => new { x.Id, x.ShopId }).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.DocumentId, x.ProductId }).IsUnique();
            e.Property(x => x.Sku).HasMaxLength(48);
            e.Property(x => x.ProductName).HasMaxLength(150);
            e.Property(x => x.Unit).HasMaxLength(30);
        });
    }
}
