namespace FinPilot.Engine.Forecasting;

/// <summary>
/// Deterministic daily cash projection:
/// closing = opening + inflow - outflow; next day's opening = today's closing.
/// Projected balances MAY go negative: a negative value is an unmet obligation, not an overdraft.
/// </summary>
public static class CashForecaster
{
    public const string EngineVersion = "forecast-v1";
    public const int MaxHorizonDays = 56;

    public static ForecastResult Run(ForecastInput input)
    {
        Validate(input);

        var end = input.Start.AddDays(input.HorizonDays - 1);

        // Events dated before Start are unresolved (e.g. overdue): never auto-shifted or assumed paid.
        var unresolved = input.Events.Where(e => e.Date < input.Start).ToList();
        var afterHorizon = input.Events.Where(e => e.Date > end).ToList();
        var byDate = input.Events
            .Where(e => e.Date >= input.Start && e.Date <= end)
            .ToLookup(e => e.Date);

        var days = new List<DailyBalance>(input.HorizonDays);
        var opening = input.OpeningCash;
        for (var date = input.Start; date <= end; date = date.AddDays(1))
        {
            var events = byDate[date].ToList();
            var inflow = events.Where(e => e.Direction == CashDirection.In).Sum(e => e.Amount);
            var outflow = events.Where(e => e.Direction == CashDirection.Out).Sum(e => e.Amount);
            var closing = opening + inflow - outflow;
            days.Add(new DailyBalance(date, opening, inflow, outflow, closing, events.Select(e => e.Id).ToList()));
            opening = closing;
        }

        var summary = Summarize(days);
        return new ForecastResult(
            days,
            summary.LowestBalance,
            summary.LowestBalanceDate,
            summary.FirstShortageDate,
            summary.MaxShortage,
            unresolved,
            afterHorizon);
    }

    private sealed record ShortageSummary(
        decimal LowestBalance,
        DateOnly LowestBalanceDate,
        DateOnly? FirstShortageDate,
        decimal MaxShortage);

    private static ShortageSummary Summarize(IReadOnlyList<DailyBalance> days)
    {
        var lowest = days[0];
        DateOnly? firstShortageDate = null;
        foreach (var day in days)
        {
            if (day.Closing < lowest.Closing)
                lowest = day;
            if (day.Closing < 0 && firstShortageDate is null)
                firstShortageDate = day.Date;
        }

        return new ShortageSummary(lowest.Closing, lowest.Date, firstShortageDate, Math.Max(0m, -lowest.Closing));
    }

    private static void Validate(ForecastInput input)
    {
        if (input.HorizonDays is < 1 or > MaxHorizonDays)
            throw new ArgumentOutOfRangeException(nameof(input), $"HorizonDays must be 1..{MaxHorizonDays}.");
        if (input.OpeningCash < 0 || !IsWholeVnd(input.OpeningCash))
            throw new ArgumentException("OpeningCash must be a non-negative whole VND amount.", nameof(input));

        foreach (var e in input.Events)
        {
            if (e.Amount <= 0 || !IsWholeVnd(e.Amount))
                throw new ArgumentException($"Event {e.Id}: amount must be a positive whole VND amount.", nameof(input));
        }

        if (input.Events.Select(e => e.Id).Distinct().Count() != input.Events.Count)
            throw new ArgumentException("Event ids must be unique.", nameof(input));
    }

    // VND has no minor unit: reject fractions instead of silently rounding.
    public static bool IsWholeVnd(decimal amount) => decimal.Truncate(amount) == amount;
}
