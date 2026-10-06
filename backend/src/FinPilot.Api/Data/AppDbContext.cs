using FinPilot.Api.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace FinPilot.Api.Data;

/// <summary>
/// EF migrations are the schema owner (database/reference/*.sql is the design baseline only;
/// never apply both). Identity stays in "public" with text keys; business tables live in "finpilot".
/// </summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<IdentityUser>(options)
{
    public const string BusinessSchema = "finpilot";

    public DbSet<Shop> Shops => Set<Shop>();

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

        // Week 2 F09/F10: balance_snapshots, obligations (shops is scaffolded here early).
        // Week 3 F14/F16/F17/F18: cash_transactions, audit_logs, import_batches, import_rows.
        // Week 4 F21/F22: scenarios, scenario_adjustments. Preserve reference SQL composite FKs and CHECKs.
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // VND: whole numbers only. The API rejects fractions before they ever reach numeric(18,0).
        configurationBuilder.Properties<decimal>().HavePrecision(18, 0);
    }
}
