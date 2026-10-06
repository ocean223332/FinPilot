using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using FinPilot.Engine.Forecasting;

namespace FinPilot.Api.Json;

/// <summary>
/// Money crosses the API as JSON strings ("50000000") so JavaScript never rounds it through a double.
/// Fractions are rejected rather than rounded.
/// </summary>
public sealed class VndStringConverter : JsonConverter<decimal>
{
    public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
            throw new JsonException("Money must be sent as a string of whole VND, e.g. \"50000000\".");

        var text = reader.GetString();
        if (!decimal.TryParse(text, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var value)
            || !CashForecaster.IsWholeVnd(value))
            throw new JsonException($"'{text}' is not a whole VND amount.");

        return value;
    }

    public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options)
    {
        if (!CashForecaster.IsWholeVnd(value))
            throw new JsonException("Money must be a whole VND amount; fractions cannot be rounded.");

        writer.WriteStringValue(value.ToString("0", CultureInfo.InvariantCulture));
    }
}
