using FinPilot.Api.Domain;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace FinPilot.Api.Data;

/// <summary>
/// EF migrations are the schema owner (database/reference/*.sql is the design baseline only;
/// never apply both). Identity stays in "public" with text keys; business tables live in "finpilot".
/// </summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<IdentityUser>(options), IDataProtectionKeyContext
{
    public const string BusinessSchema = "finpilot";

    public DbSet<DataProtectionKey> DataProtectionKeys { get; set; } = null!;

    public DbSet<Shop> Shops => Set<Shop>();
    public DbSet<BalanceSnapshot> BalanceSnapshots => Set<BalanceSnapshot>();
    public DbSet<Obligation> Obligations => Set<Obligation>();
    public DbSet<CashTransaction> CashTransactions => Set<CashTransaction>();
    public DbSet<ImportBatch> ImportBatches => Set<ImportBatch>();
    public DbSet<Scenario> Scenarios => Set<Scenario>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Shop>(e =>
        {
            e.ToTable("shops", BusinessSchema, t =>
            {
                t.HasCheckConstraint("ck_shops_name_not_blank", "length(btrim(name)) > 0");
                t.HasCheckConstraint("ck_shops_currency_vnd", "currency = 'VND'");
                t.HasCheckConstraint("ck_shops_data_version", "data_version >= 0");
            });
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            e.Property(x => x.OwnerUserId).HasColumnName("owner_user_id").IsRequired();
            e.HasIndex(x => x.OwnerUserId).IsUnique(); // MVP: one owner, one shop
            e.HasOne<IdentityUser>().WithMany().HasForeignKey(x => x.OwnerUserId).OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
            e.Property(x => x.Currency).HasColumnName("currency").HasColumnType("char(3)").HasDefaultValue("VND");
            e.Property(x => x.TimeZone).HasColumnName("time_zone").HasMaxLength(64).HasDefaultValue("Asia/Ho_Chi_Minh");
            e.Property(x => x.DataVersion).HasColumnName("data_version").HasDefaultValue(0L);
            e.Property(x => x.CurrentSnapshotId).HasColumnName("current_snapshot_id");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");
        });

        ConfigureShopRecords(builder);
        InventoryModel.Configure(builder);
    }

    private static void ConfigureShopRecords(ModelBuilder builder)
    {
        // Explicit snake_case names keep the migration aligned with the reference design.
        foreach (var type in new[] { typeof(BalanceSnapshot), typeof(Obligation), typeof(CashTransaction),
                     typeof(ImportBatch), typeof(Scenario), typeof(AuditLog) })
        {
            var e = builder.Entity(type);
            e.HasKey(nameof(ShopRecord.Id));
            e.HasAlternateKey(nameof(ShopRecord.Id), nameof(ShopRecord.ShopId));
            e.HasOne(typeof(Shop)).WithMany().HasForeignKey(nameof(ShopRecord.ShopId)).OnDelete(DeleteBehavior.Restrict);
            foreach (var property in e.Metadata.GetProperties())
                property.SetColumnName(System.Text.RegularExpressions.Regex.Replace(property.Name, "(?<!^)([A-Z])", "_$1").ToLowerInvariant());
        }
        builder.Entity<BalanceSnapshot>(e =>
        {
            e.ToTable("balance_snapshots", BusinessSchema, t =>
            {
                t.HasCheckConstraint("ck_snapshot_amount", "closing_amount >= 0 AND closing_amount <> 'NaN'::numeric");
                t.HasCheckConstraint("ck_snapshot_date", "isfinite(as_of_date)");
            });
            e.HasOne<IdentityUser>().WithMany().HasForeignKey(x => x.CreatedBy).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<Shop>().HasOne<BalanceSnapshot>().WithMany()
            .HasForeignKey(x => new { x.CurrentSnapshotId, x.Id })
            .HasPrincipalKey(x => new { x.Id, x.ShopId }).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<ImportBatch>(e =>
        {
            e.ToTable("import_batches", BusinessSchema, t =>
            {
                t.HasCheckConstraint("ck_import_hash", "file_sha256 ~ '^[0-9a-f]{64}$'");
                t.HasCheckConstraint("ck_import_count", "line_count >= 0");
            });
            e.Property(x => x.FileSha256).HasMaxLength(64);
            e.Property(x => x.FileName).HasMaxLength(255);
            e.HasIndex(x => new { x.ShopId, x.FileSha256 }).IsUnique();
            e.HasOne<IdentityUser>().WithMany().HasForeignKey(x => x.CreatedBy).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<Obligation>(e =>
        {
            e.ToTable("obligations", BusinessSchema, t =>
            {
                t.HasCheckConstraint("ck_obligation_amount", "amount > 0 AND amount <> 'NaN'::numeric");
                t.HasCheckConstraint("ck_obligation_date", "isfinite(due_date)");
                t.HasCheckConstraint("ck_obligation_direction", "direction IN ('In','Out')");
                t.HasCheckConstraint("ck_obligation_status", "status IN ('open','paid','cancelled')");
                t.HasCheckConstraint("ck_obligation_label", "length(btrim(label)) > 0");
            });
            e.Property(x => x.Direction).HasMaxLength(3);
            e.Property(x => x.Status).HasMaxLength(10);
            e.Property(x => x.Label).HasMaxLength(200);
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.HasAlternateKey(x => new { x.Id, x.ShopId, x.Direction });
            e.HasIndex(x => new { x.ShopId, x.DueDate });
            e.HasOne<ImportBatch>().WithMany().HasForeignKey(x => new { x.ImportBatchId, x.ShopId })
                .HasPrincipalKey(x => new { x.Id, x.ShopId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<IdentityUser>().WithMany().HasForeignKey(x => x.CreatedBy).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<CashTransaction>(e =>
        {
            e.ToTable("cash_transactions", BusinessSchema, t =>
            {
                t.HasCheckConstraint("ck_cash_amount", "amount > 0 AND amount <> 'NaN'::numeric");
                t.HasCheckConstraint("ck_cash_date", "isfinite(tx_date)");
                t.HasCheckConstraint("ck_cash_direction", "direction IN ('In','Out')");
                t.HasCheckConstraint("ck_cash_void", "(voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL AND length(btrim(void_reason)) > 0)");
            });
            e.Property(x => x.Direction).HasMaxLength(3);
            e.HasOne<Obligation>().WithMany().HasForeignKey(x => new { x.ObligationId, x.ShopId, x.Direction })
                .HasPrincipalKey(x => new { x.Id, x.ShopId, x.Direction }).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.ShopId, x.PaymentId }).IsUnique().HasFilter("voided_at IS NULL");
            e.HasIndex(x => new { x.ShopId, x.ObligationId });
            e.HasOne<IdentityUser>().WithMany().HasForeignKey(x => x.RecordedBy).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<IdentityUser>().WithMany().HasForeignKey(x => x.VoidedBy).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<Scenario>(e =>
        {
            e.ToTable("scenarios", BusinessSchema, t =>
            {
                t.HasCheckConstraint("ck_scenario_name", "length(btrim(name)) > 0");
                t.HasCheckConstraint("ck_scenario_version", "base_data_version >= 0");
                t.HasCheckConstraint("ck_scenario_payload", "jsonb_typeof(payload_json) = 'object'");
                t.HasCheckConstraint("ck_scenario_baseline", "jsonb_typeof(base_input_json) = 'object'");
            });
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.PayloadJson).HasColumnType("jsonb");
            e.Property(x => x.BaseInputJson).HasColumnType("jsonb");
            e.HasOne<IdentityUser>().WithMany().HasForeignKey(x => x.CreatedBy).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<AuditLog>(e =>
        {
            e.ToTable("audit_logs", BusinessSchema, t =>
            {
                t.HasCheckConstraint("ck_audit_before", "before_json IS NULL OR jsonb_typeof(before_json) = 'object'");
                t.HasCheckConstraint("ck_audit_after", "jsonb_typeof(after_json) = 'object'");
            });
            e.Property(x => x.EntityType).HasMaxLength(80);
            e.Property(x => x.Action).HasMaxLength(80);
            e.Property(x => x.BeforeJson).HasColumnType("jsonb");
            e.Property(x => x.AfterJson).HasColumnType("jsonb");
            e.HasIndex(x => new { x.ShopId, x.OccurredAt });
            e.HasOne<IdentityUser>().WithMany().HasForeignKey(x => x.ActorUserId).OnDelete(DeleteBehavior.Restrict);
        });
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // VND: whole numbers only. The API rejects fractions before they ever reach numeric(18,0).
        configurationBuilder.Properties<decimal>().HavePrecision(18, 0);
    }
}
