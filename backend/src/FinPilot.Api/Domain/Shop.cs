namespace FinPilot.Api.Domain;

public class Shop
{
    public Guid Id { get; set; }
    public required string OwnerUserId { get; set; }
    public required string Name { get; set; }
    public string Currency { get; set; } = "VND";
    public string TimeZone { get; set; } = "Asia/Ho_Chi_Minh";
    public long DataVersion { get; set; }
    public Guid? CurrentSnapshotId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
