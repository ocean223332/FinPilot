using FinPilot.Engine.Forecasting;

namespace FinPilot.Engine.Tests;

/// <summary>
/// Acceptance cases from "Tiêu chí nghiệm thu MVP" (relative days; amounts in VND).
/// Snapshot 50m at day -1 → opening cash 50m on day 0.
/// </summary>
public class CashForecasterAcceptanceTests
{
    private const decimal M = 1_000_000m;
    private static readonly DateOnly Day0 = new(2026, 1, 1);

    private static DateOnly Day(int n) => Day0.AddDays(n);

    private static CashEvent Out(decimal millions, int day, string label = "out") =>
        new(Guid.NewGuid(), CashDirection.Out, millions * M, Day(day), label);

    private static CashEvent In(decimal millions, int day, string label = "in") =>
        new(Guid.NewGuid(), CashDirection.In, millions * M, Day(day), label);

    private static ForecastResult Run(params CashEvent[] events) =>
        CashForecaster.Run(new ForecastInput(50 * M, Day0, CashForecaster.MaxHorizonDays, events));

    private static decimal ClosingOn(ForecastResult r, int day) => r.Days.Single(d => d.Date == Day(day)).Closing;

    [Fact]
    public void BuyNow_ShortOnDay7_By5m()
    {
        var r = Run(Out(30, 0, "Nhập hàng"), Out(25, 7, "Lương + thuê"), In(35, 14, "COD"));

        Assert.Equal(20 * M, ClosingOn(r, 0));
        Assert.Equal(-5 * M, ClosingOn(r, 7));
        Assert.Equal(30 * M, ClosingOn(r, 14));
        Assert.Equal(Day(7), r.FirstShortageDate);
        Assert.Equal(5 * M, r.MaxShortage);
        Assert.Equal(-5 * M, r.LowestBalance);
    }

    [Fact]
    public void SplitPurchase_NeverShort()
    {
        var r = Run(Out(20, 0), Out(25, 7), In(35, 14), Out(10, 15));

        Assert.Equal(30 * M, ClosingOn(r, 0));
        Assert.Equal(5 * M, ClosingOn(r, 7));
        Assert.Equal(40 * M, ClosingOn(r, 14));
        Assert.Equal(30 * M, ClosingOn(r, 15));
        Assert.Null(r.FirstShortageDate);
        Assert.Equal(0m, r.MaxShortage);
        Assert.Equal(5 * M, r.LowestBalance);
        Assert.Equal(Day(7), r.LowestBalanceDate);
    }

    [Fact]
    public void SplitPurchase_ReceiptDelayedToDay16_ShortOnDay15()
    {
        var r = Run(Out(20, 0), Out(25, 7), In(35, 16), Out(10, 15));

        Assert.Equal(-5 * M, ClosingOn(r, 15));
        Assert.Equal(Day(15), r.FirstShortageDate);
        Assert.Equal(5 * M, r.MaxShortage);
    }

    [Fact]
    public void OverdueEvent_IsReportedUnresolved_NotCounted()
    {
        var overdue = Out(10, -3, "Công nợ quá hạn");
        var r = Run(overdue);

        Assert.Contains(overdue, r.UnresolvedEvents);
        Assert.Equal(50 * M, ClosingOn(r, 0));
    }

    [Fact]
    public void SameDayInAndOut_FlagsIntradayTimingRisk()
    {
        var r = Run(Out(60, 3), In(20, 3));

        var day3 = r.Days.Single(d => d.Date == Day(3));
        Assert.True(day3.HasIntradayTimingRisk);
        Assert.Equal(10 * M, day3.Closing);
    }

    [Fact]
    public void FractionalVnd_IsRejected()
    {
        var bad = new CashEvent(Guid.NewGuid(), CashDirection.Out, 1000.5m, Day0, "bad");
        Assert.Throws<ArgumentException>(() => Run(bad));
    }
}
