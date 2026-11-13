using System.Security.Claims;
using FinPilot.Api.Shops;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace FinPilot.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/shop")]
public sealed partial class ShopController(ShopService service) : ControllerBase, IAsyncActionFilter
{
    private string Owner => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    [HttpGet] public Task<ShopResponse> Get(CancellationToken ct) => service.Read(Owner, ct);
    [HttpPost] public Task<ShopResponse> Create(CreateShop input, CancellationToken ct) => service.Create(Owner, input, ct);
    [HttpPut("balance")] public Task<ShopResponse> Balance(BalanceInput input, CancellationToken ct) => service.Balance(Owner, input, ct);
    [HttpPut("obligations/{id:guid}")] public Task<ShopResponse> Obligation(Guid id, ObligationInput input, CancellationToken ct) => service.SaveObligation(Owner, id, input, ct);
    [HttpDelete("obligations/{id:guid}")] public Task<ShopResponse> DeleteObligation(Guid id, CancellationToken ct) => service.DeleteObligation(Owner, id, ct);
    [HttpPost("imports")] public Task<ShopResponse> Import(ImportInput input, CancellationToken ct) => service.Import(Owner, input, ct);
    [HttpPut("scenarios/{id:guid}")] public Task<ShopResponse> Scenario(Guid id, ScenarioInput input, CancellationToken ct) => service.SaveScenario(Owner, id, input, ct);
    [HttpDelete("scenarios/{id:guid}")] public Task<ShopResponse> DeleteScenario(Guid id, CancellationToken ct) => service.DeleteScenario(Owner, id, ct);
    [HttpPut("data")] public Task<ShopResponse> Replace(ShopInput input, CancellationToken ct) => service.Replace(Owner, input, ct);

    // Individual GETs expose only records in the caller's shop, just like full-shop reads.
    [HttpGet("obligations/{id:guid}")]
    public async Task<ActionResult<ObligationInput>> GetObligation(Guid id, CancellationToken ct)
    {
        var row = (await service.Read(Owner, ct)).Obligations.SingleOrDefault(x => x.Id == id);
        return row is null ? NotFound() : Ok(row);
    }
    [HttpGet("scenarios/{id:guid}")]
    public async Task<ActionResult<ScenarioInput>> GetScenario(Guid id, CancellationToken ct)
    {
        var row = (await service.Read(Owner, ct)).Scenarios.SingleOrDefault(x => x.Id == id);
        return row is null ? NotFound() : Ok(row);
    }

    [NonAction]
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var executed = await next();
        if (executed.Exception is not ShopProblem error) return;
        var details = new ProblemDetails { Status = error.Status, Title = error.Message, Type = $"https://finpilot.app/problems/{error.Type}" };
        if (error.Detail is not null) details.Extensions["committedAt"] = error.Detail;
        executed.Result = new ObjectResult(details) { StatusCode = error.Status };
        executed.ExceptionHandled = true;
    }
}
