using System.Collections;
using System.ComponentModel.DataAnnotations;
using System.Data;
using System.Text.Json;
using FinPilot.Api.Data;
using FinPilot.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MvcJsonOptions = Microsoft.AspNetCore.Mvc.JsonOptions;

namespace FinPilot.Api.Shops;

public sealed class ShopProblem(int status, string title, string type = "shop-error", object? detail = null) : Exception(title)
{
    public int Status { get; } = status;
    public string Type { get; } = type;
    public object? Detail { get; } = detail;
}

public sealed partial class ShopService(AppDbContext db, IOptions<MvcJsonOptions> jsonOptions)
{
    private JsonSerializerOptions Json => jsonOptions.Value.JsonSerializerOptions;
    private static ShopProblem Missing() => new(404, "Record not found.");
    private static ShopProblem Invalid(string message) => new(400, message);
    private static ShopProblem NoShop() => new(404, "Create a shop first.", "no-shop");

    public async Task<ShopResponse> Read(string owner, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var shop = await db.Shops.AsNoTracking().SingleOrDefaultAsync(x => x.OwnerUserId == owner, ct) ?? throw NoShop();
        var response = await Response(shop, ct);
        await transaction.CommitAsync(ct);
        return response;
    }

    public async Task<ShopResponse> Create(string owner, CreateShop input, CancellationToken ct)
    {
        Validate(input);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // Serialize concurrent attempts to create the account's only shop.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM public.\"AspNetUsers\" WHERE \"Id\" = {owner} FOR UPDATE", ct);
        if (await db.Shops.AnyAsync(x => x.OwnerUserId == owner, ct))
            throw new ShopProblem(409, "This account already has a shop.");
        var shop = new Domain.Shop
        {
            Id = Guid.NewGuid(), OwnerUserId = owner, Name = input.Name.Trim(),
            CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow, DataVersion = 1
        };
        db.Shops.Add(shop);
        await db.SaveChangesAsync(ct);
        var response = await Response(shop, ct);
        AddAudit(shop, "create", "shop", shop.Id, null, Summary(response, shop.Id));
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return response;
    }

    public Task<ShopResponse> Balance(string owner, BalanceInput input, CancellationToken ct)
    {
        var snapshotId = Guid.NewGuid();
        return Write(owner, "balance", "snapshot", snapshotId, async shop =>
        {
            Validate(input);
            await AppendBalance(shop, input, ct, snapshotId);
        }, ct);
    }

    public Task<ShopResponse> SaveObligation(string owner, Guid id, ObligationInput input, CancellationToken ct) =>
        Write(owner, "upsert", "obligation", id, async shop =>
        {
            Validate(input);
            if (id != input.Id) throw Invalid("The route and obligation ID must match.");
            await CheckStockObligationEdit(shop.Id, input, ct);
            await UpsertObligation(shop, input, ct);
        }, ct);

    public Task<ShopResponse> DeleteObligation(string owner, Guid id, CancellationToken ct) =>
        Write(owner, "remove", "obligation", id, async shop =>
        {
            var row = await db.Obligations.SingleOrDefaultAsync(x => x.Id == id && x.ShopId == shop.Id && x.RemovedAt == null, ct)
                ?? throw Missing();
            if (await db.Set<StockDocument>().AnyAsync(x => x.ShopId == shop.Id && x.ObligationId == id, ct))
                throw Invalid("Hãy hủy phiếu trong Kho hàng để xóa khoản thu–chi liên kết.");
            await RemoveObligation(shop, row, ct);
        }, ct);

    public Task<ShopResponse> Import(string owner, ImportInput input, CancellationToken ct)
    {
        var batchId = Guid.NewGuid();
        return Write(owner, "import", "import", batchId, async shop =>
        {
            Validate(input);
            var previous = await db.ImportBatches.SingleOrDefaultAsync(x => x.ShopId == shop.Id && x.FileSha256 == input.FileSha256, ct);
            if (previous is not null)
                throw new ShopProblem(409, "This file has already been imported.", "duplicate-import", previous.CommittedAt);
            if (input.Obligations.Select(x => x.Id).Distinct().Count() != input.Obligations.Length)
                throw Invalid("Obligation IDs must be unique.");
            var batch = new ImportBatch
            {
                Id = batchId,
                ShopId = shop.Id, FileSha256 = input.FileSha256, FileName = input.FileName,
                LineCount = input.Obligations.Length, CreatedBy = owner, CommittedAt = DateTimeOffset.UtcNow
            };
            db.ImportBatches.Add(batch);
            await db.SaveChangesAsync(ct);
            foreach (var row in input.Obligations)
            {
                if (await db.Obligations.AnyAsync(x => x.Id == row.Id, ct))
                {
                    if (await db.Obligations.AnyAsync(x => x.Id == row.Id && x.ShopId != shop.Id, ct)) throw Missing();
                    throw Invalid("An imported obligation ID already exists.");
                }
                await UpsertObligation(shop, row with { ImportedFrom = input.FileSha256 }, ct);
            }
        }, ct);
    }

    public Task<ShopResponse> SaveScenario(string owner, Guid id, ScenarioInput input, CancellationToken ct) =>
        Write(owner, "upsert", "scenario", id, async shop =>
        {
            Validate(input);
            if (id != input.Id) throw Invalid("The route and scenario ID must match.");
            await UpsertScenario(shop, input, ct);
        }, ct);

    public Task<ShopResponse> DeleteScenario(string owner, Guid id, CancellationToken ct) =>
        Write(owner, "remove", "scenario", id, async shop =>
        {
            var row = await db.Scenarios.SingleOrDefaultAsync(x => x.Id == id && x.ShopId == shop.Id && x.RemovedAt == null, ct)
                ?? throw Missing();
            row.RemovedAt = DateTimeOffset.UtcNow;
        }, ct);

    public Task<ShopResponse> Replace(string owner, ShopInput input, CancellationToken ct) =>
        Write(owner, "replace", "shop", Guid.Empty, async shop =>
        {
            Validate(input);
            Unique(input.Obligations.Select(x => x.Id));
            Unique(input.Scenarios.Select(x => x.Id));
            if (input.Imports.Select(x => x.FileSha256).Distinct().Count() != input.Imports.Length)
                throw Invalid("Import hashes must be unique.");
            // All changes, including intermediate SaveChanges, are inside the same transaction.
            var linkedIds = await db.Set<StockDocument>().Where(x => x.ShopId == shop.Id && x.ObligationId != null)
                .Select(x => x.ObligationId!.Value).ToArrayAsync(ct);
            if (input.Obligations.Any(x => linkedIds.Contains(x.Id))) throw Invalid("Không thể thay khoản thu–chi từ phiếu kho.");
            var ids = input.Obligations.Select(x => x.Id).Concat(linkedIds).ToArray();
            foreach (var row in await db.Obligations.Where(x => x.ShopId == shop.Id && x.RemovedAt == null && !ids.Contains(x.Id)).ToListAsync(ct))
                await RemoveObligation(shop, row, ct);
            var scenarioIds = input.Scenarios.Select(x => x.Id).ToArray();
            foreach (var row in await db.Scenarios.Where(x => x.ShopId == shop.Id && x.RemovedAt == null && !scenarioIds.Contains(x.Id)).ToListAsync(ct))
                row.RemovedAt = DateTimeOffset.UtcNow;
            var hashes = input.Imports.Select(x => x.FileSha256).ToArray();
            foreach (var batch in await db.ImportBatches.Where(x => x.ShopId == shop.Id).ToListAsync(ct))
                batch.RemovedAt = hashes.Contains(batch.FileSha256) ? null : DateTimeOffset.UtcNow;
            foreach (var record in input.Imports)
            {
                var existing = await db.ImportBatches.SingleOrDefaultAsync(x => x.ShopId == shop.Id && x.FileSha256 == record.FileSha256, ct);
                if (existing is null)
                    db.ImportBatches.Add(new ImportBatch
                    {
                        ShopId = shop.Id, FileSha256 = record.FileSha256, FileName = record.FileName,
                        CommittedAt = record.CommittedAt.ToUniversalTime(), LineCount = record.LineCount, CreatedBy = owner
                    });
            }
            await db.SaveChangesAsync(ct);
            foreach (var obligation in input.Obligations) await UpsertObligation(shop, obligation, ct);
            if (input.Balance is not null) await AppendBalance(shop, input.Balance, ct);
            else shop.CurrentSnapshotId = null;
            await db.SaveChangesAsync(ct);
            foreach (var scenario in input.Scenarios) await UpsertScenario(shop, scenario, ct);
        }, ct);

    private async Task<ShopResponse> Write(string owner, string action, string entityType, Guid entityId,
        Func<Domain.Shop, Task> change, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        var shop = await db.Shops.FromSqlInterpolated($"SELECT * FROM finpilot.shops WHERE owner_user_id = {owner} FOR UPDATE")
            .SingleOrDefaultAsync(ct) ?? throw NoShop();
        if (entityId == Guid.Empty) entityId = shop.Id;
        var before = Summary(await Response(shop, ct), entityId);
        await change(shop);
        shop.DataVersion++;
        shop.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        var response = await Response(shop, ct);
        AddAudit(shop, action, entityType, entityId, before, Summary(response, entityId));
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return response;
    }

    private async Task AppendBalance(Domain.Shop shop, BalanceInput input, CancellationToken ct, Guid? id = null)
    {
        var snapshot = new BalanceSnapshot
        {
            Id = id ?? Guid.NewGuid(),
            ShopId = shop.Id, ClosingAmount = input.Amount, AsOfDate = input.Cutoff,
            CreatedBy = shop.OwnerUserId, CreatedAt = DateTimeOffset.UtcNow
        };
        db.BalanceSnapshots.Add(snapshot);
        await db.SaveChangesAsync(ct);
        shop.CurrentSnapshotId = snapshot.Id;
    }

    private async Task UpsertObligation(Domain.Shop shop, ObligationInput input, CancellationToken ct)
    {
        if (input.Id == Guid.Empty) throw Invalid("An obligation must have a nonempty GUID.");
        Unique(input.Payments.Select(x => x.Id));
        if (input.Payments.Sum(x => x.Amount) > input.Amount) throw Invalid("Payments cannot exceed the obligation amount.");
        if (input.Status == "paid" && input.Payments.Sum(x => x.Amount) != input.Amount)
            throw Invalid("A paid obligation must be fully settled by payments.");
        var row = await db.Obligations.SingleOrDefaultAsync(x => x.Id == input.Id, ct);
        if (row is not null && row.ShopId != shop.Id) throw Missing();
        var now = DateTimeOffset.UtcNow;
        if (row is not null && row.Direction != input.Direction)
        {
            if (await db.CashTransactions.AnyAsync(x => x.ObligationId == row.Id, ct))
                throw Invalid("The direction of an obligation with payment history cannot change.");
            // Direction is part of the ledger's composite FK; EF treats principal keys as immutable.
            await db.Obligations.Where(x => x.Id == row.Id && x.ShopId == shop.Id).ExecuteUpdateAsync(
                update => update.SetProperty(x => x.Direction, input.Direction), ct);
            db.Entry(row).State = EntityState.Detached;
            row = await db.Obligations.SingleAsync(x => x.Id == input.Id && x.ShopId == shop.Id, ct);
        }
        if (row is null)
        {
            row = new Obligation
            {
                Id = input.Id, ShopId = shop.Id, Direction = input.Direction, Label = input.Label,
                Status = input.Status, Notes = input.Note, CreatedBy = shop.OwnerUserId, CreatedAt = now
            };
            db.Obligations.Add(row);
        }
        Guid? batchId = null;
        if (input.ImportedFrom is not null)
        {
            batchId = await db.ImportBatches.Where(x => x.ShopId == shop.Id && x.FileSha256 == input.ImportedFrom)
                .Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct);
            if (batchId is null) throw Invalid("The source import is not in this shop.");
        }
        row.Label = input.Label.Trim(); row.Amount = input.Amount; row.DueDate = input.Date;
        row.Notes = input.Note; row.Status = input.Status; row.ImportBatchId = batchId;
        row.RemovedAt = null; row.UpdatedAt = now;
        var active = await db.CashTransactions.Where(x => x.ShopId == shop.Id && x.ObligationId == input.Id && x.VoidedAt == null).ToListAsync(ct);
        foreach (var old in active)
        {
            var replacement = input.Payments.SingleOrDefault(x => x.Id == old.PaymentId);
            if (replacement is null || replacement.Amount != old.Amount || replacement.Date != old.TxDate)
                Void(old, shop.OwnerUserId, now);
        }
        await db.SaveChangesAsync(ct); // VOID first, before reusing a payment's active idempotency key.
        foreach (var payment in input.Payments)
        {
            if (active.Any(x => x.PaymentId == payment.Id && x.VoidedAt == null)) continue;
            if (await db.CashTransactions.AnyAsync(x => x.PaymentId == payment.Id && (x.ShopId != shop.Id || x.ObligationId != input.Id), ct))
                throw Missing();
            db.CashTransactions.Add(new CashTransaction
            {
                PaymentId = payment.Id, ShopId = shop.Id, ObligationId = row.Id, Direction = row.Direction,
                Amount = payment.Amount, TxDate = payment.Date, RecordedBy = shop.OwnerUserId, RecordedAt = now
            });
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task RemoveObligation(Domain.Shop shop, Obligation row, CancellationToken ct)
    {
        row.RemovedAt = DateTimeOffset.UtcNow;
        row.UpdatedAt = row.RemovedAt.Value;
        foreach (var payment in await db.CashTransactions.Where(x => x.ShopId == shop.Id && x.ObligationId == row.Id && x.VoidedAt == null).ToListAsync(ct))
            Void(payment, shop.OwnerUserId, row.RemovedAt.Value);
    }

    private static void Void(CashTransaction row, string actor, DateTimeOffset now)
    {
        row.VoidedAt = now; row.VoidedBy = actor; row.VoidReason = "Payment removed or corrected by shop owner.";
    }

    private async Task UpsertScenario(Domain.Shop shop, ScenarioInput input, CancellationToken ct)
    {
        if (input.Id == Guid.Empty) throw Invalid("A scenario must have a nonempty GUID.");
        if (input.Adjustments.Select(x => x.Id).Distinct().Count() != input.Adjustments.Length)
            throw Invalid("Adjustment IDs must be unique.");
        foreach (var target in input.Adjustments.OfType<TargetAdjustment>())
        {
            if (!Guid.TryParse(target.TargetId, out var id)) continue;
            if (await db.Obligations.AnyAsync(x => x.Id == id && x.ShopId != shop.Id, ct) ||
                await db.CashTransactions.AnyAsync(x => x.PaymentId == id && x.ShopId != shop.Id, ct)) throw Missing();
        }
        var row = await db.Scenarios.SingleOrDefaultAsync(x => x.Id == input.Id, ct);
        if (row is not null && row.ShopId != shop.Id) throw Missing();
        var baseline = await Response(shop, ct);
        var baselineJson = JsonSerializer.Serialize(new { baseline.Balance, baseline.Obligations }, Json);
        if (row is null)
        {
            row = new Scenario
            {
                Id = input.Id, ShopId = shop.Id, Name = input.Name, PayloadJson = "{}", BaseInputJson = baselineJson,
                BaseDataVersion = shop.DataVersion, CreatedBy = shop.OwnerUserId, CreatedAt = DateTimeOffset.UtcNow
            };
            db.Scenarios.Add(row);
        }
        else if (JsonSerializer.Deserialize<ScenarioInput>(row.PayloadJson, Json)!.BaseFingerprint != input.BaseFingerprint)
        {
            row.BaseInputJson = baselineJson;
            row.BaseDataVersion = shop.DataVersion;
        }
        row.Name = input.Name.Trim(); row.PayloadJson = JsonSerializer.Serialize(input, Json);
        row.RemovedAt = null; row.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    private async Task<ShopResponse> Response(Domain.Shop shop, CancellationToken ct)
    {
        var balance = await db.BalanceSnapshots.AsNoTracking().SingleOrDefaultAsync(x => x.ShopId == shop.Id && x.Id == shop.CurrentSnapshotId, ct);
        var obligations = await db.Obligations.AsNoTracking().Where(x => x.ShopId == shop.Id && x.RemovedAt == null).OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).ToListAsync(ct);
        var payments = await db.CashTransactions.AsNoTracking().Where(x => x.ShopId == shop.Id && x.VoidedAt == null).OrderBy(x => x.RecordedAt).ThenBy(x => x.Id).ToListAsync(ct);
        var batches = await db.ImportBatches.AsNoTracking().Where(x => x.ShopId == shop.Id).OrderBy(x => x.CommittedAt).ThenBy(x => x.Id).ToListAsync(ct);
        var scenarios = await db.Scenarios.AsNoTracking().Where(x => x.ShopId == shop.Id && x.RemovedAt == null).OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).ToListAsync(ct);
        return new ShopResponse
        {
            Version = 1, Name = shop.Name, DataVersion = shop.DataVersion,
            Balance = balance is null ? null : new BalanceInput { Amount = balance.ClosingAmount, Cutoff = balance.AsOfDate },
            Obligations = obligations.Select(x => new ObligationInput
            {
                Id = x.Id, Direction = x.Direction, Label = x.Label, Amount = x.Amount, Date = x.DueDate,
                Note = x.Notes, Status = x.Status, ImportedFrom = batches.SingleOrDefault(b => b.Id == x.ImportBatchId)?.FileSha256,
                Payments = payments.Where(p => p.ObligationId == x.Id).Select(p => new PaymentInput { Id = p.PaymentId, Amount = p.Amount, Date = p.TxDate }).ToArray()
            }).ToArray(),
            Scenarios = scenarios.Select(x => JsonSerializer.Deserialize<ScenarioInput>(x.PayloadJson, Json)!).ToArray(),
            Imports = batches.Where(x => x.RemovedAt == null).Select(x => new ImportRecord
            {
                FileSha256 = x.FileSha256, FileName = x.FileName, CommittedAt = x.CommittedAt, LineCount = x.LineCount
            }).ToArray()
        };
    }

    private string Summary(ShopResponse response, Guid id) => JsonSerializer.Serialize(new
    {
        response.DataVersion, response.Balance, obligationCount = response.Obligations.Length,
        scenarioCount = response.Scenarios.Length, importCount = response.Imports.Length,
        totalAmount = response.Obligations.Sum(x => x.Amount), totalPaid = response.Obligations.Sum(x => x.Payments.Sum(p => p.Amount)),
        obligation = response.Obligations.SingleOrDefault(x => x.Id == id),
        scenario = response.Scenarios.SingleOrDefault(x => x.Id == id)
    }, Json);

    private void AddAudit(Domain.Shop shop, string action, string entityType, Guid entityId, string? before, string after) =>
        db.AuditLogs.Add(new AuditLog
        {
            ShopId = shop.Id, ActorUserId = shop.OwnerUserId, OccurredAt = DateTimeOffset.UtcNow,
            Action = action, EntityType = entityType, EntityId = entityId, BeforeJson = before, AfterJson = after
        });

    private static void Unique(IEnumerable<Guid> ids)
    {
        var values = ids.ToArray();
        if (values.Contains(Guid.Empty) || values.Distinct().Count() != values.Length)
            throw Invalid("IDs must be nonempty and unique.");
    }

    // MVC validates the declared model; this also validates polymorphic adjustment fields and null array entries.
    private static void Validate(object? value)
    {
        if (value is null) throw Invalid("Null records are not allowed.");
        if (value is string || value.GetType().IsValueType) return;
        if (value is IEnumerable items)
        {
            foreach (var item in items) Validate(item);
            return;
        }
        var errors = new List<ValidationResult>();
        if (!Validator.TryValidateObject(value, new ValidationContext(value), errors, true))
            throw Invalid(string.Join(" ", errors.Select(x => x.ErrorMessage)));
        foreach (var property in value.GetType().GetProperties())
        {
            var nested = property.GetValue(value);
            if (nested is not null) Validate(nested);
        }
    }
}
