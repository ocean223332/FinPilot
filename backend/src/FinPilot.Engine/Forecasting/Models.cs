namespace FinPilot.Engine.Forecasting;

public enum CashDirection
{
    In,
    Out,
}

/// <summary>
/// A planned cash movement (remaining unpaid portion of an obligation, or a scenario ADD).
/// Amount is always positive whole VND; Direction carries the sign.
/// </summary>
public sealed record CashEvent(Guid Id, CashDirection Direction, decimal Amount, DateOnly Date, string Label);

/// <summary>
/// OpeningCash = confirmed available cash at the START of <see cref="Start"/>
/// (snapshot closing amount rolled forward with actuals up to the day before Start).
/// </summary>
public sealed record ForecastInput(
    decimal OpeningCash,
    DateOnly Start,
    int HorizonDays,
    IReadOnlyList<CashEvent> Events);

public sealed record DailyBalance(
    DateOnly Date,
    decimal Opening,
    decimal Inflow,
    decimal Outflow,
    decimal Closing,
    IReadOnlyList<Guid> EventIds)
{
    /// <summary>
    /// Inflow and outflow on the same day: the daily model cannot tell whether the money
    /// arrives before the payment is due, so the UI must surface this limitation.
    /// </summary>
    public bool HasIntradayTimingRisk => Inflow > 0 && Outflow > 0;
}

public sealed record ForecastResult(
    IReadOnlyList<DailyBalance> Days,
    decimal LowestBalance,
    DateOnly LowestBalanceDate,
    DateOnly? FirstShortageDate,
    decimal MaxShortage,
    IReadOnlyList<CashEvent> UnresolvedEvents,
    IReadOnlyList<CashEvent> EventsAfterHorizon);
