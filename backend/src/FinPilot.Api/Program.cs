using System.Text.Json;
using System.Text.Json.Serialization;
using FinPilot.Api.Data;
using FinPilot.Api.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException(
        "ConnectionStrings:Default is required. In Development, configure it with dotnet user-secrets for FinPilot.Api.");

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.JsonSerializerOptions.Converters.Add(new VndStringConverter());
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false));
});

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));
builder.Services.AddAuthorization();
builder.Services.AddIdentityApiEndpoints<IdentityUser>()
    .AddEntityFrameworkStores<AppDbContext>();
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = IdentityConstants.ApplicationScheme;
    options.DefaultChallengeScheme = IdentityConstants.ApplicationScheme;
    options.DefaultForbidScheme = IdentityConstants.ApplicationScheme;
});
builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    };
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
    app.UseHttpsRedirection();

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

// F07: cookie-only login still needs CSRF protection for authenticated writes before those features ship.
app.MapGroup("/api/auth").AddEndpointFilterFactory((context, next) =>
{
    var useCookiesIndex = Array.FindIndex(context.MethodInfo.GetParameters(), parameter => parameter.Name == "useCookies");
    return async invocation =>
    {
        if (string.Equals(invocation.HttpContext.Request.Path.Value?.TrimEnd('/'), "/api/auth/refresh", StringComparison.OrdinalIgnoreCase))
            return Results.NotFound();

        if (useCookiesIndex >= 0)
            invocation.Arguments[useCookiesIndex] = true;

        return await next(invocation);
    };
}).MapIdentityApi<IdentityUser>();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
app.MapControllers();
app.MapFallbackToFile("index.html");

app.Run();
