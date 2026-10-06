using FinPilot.Engine.Forecasting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FinPilot.Api.Controllers;

[ApiController]
[Route("api/forecast")]
public sealed class ForecastController : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("preview")]
    public ActionResult<ForecastResult> Preview([FromBody] ForecastInput input)
    {
        try
        {
            return Ok(CashForecaster.Run(input));
        }
        catch (ArgumentException exception)
        {
            ModelState.AddModelError(exception.ParamName ?? string.Empty, exception.Message);
            return ValidationProblem(ModelState);
        }
    }
}
