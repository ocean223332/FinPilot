using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FinPilot.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryAndSales : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "products",
                schema: "finpilot",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Sku = table.Column<string>(type: "character varying(48)", maxLength: 48, nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Unit = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    MinimumStock = table.Column<int>(type: "integer", nullable: false),
                    Stock = table.Column<long>(type: "bigint", nullable: false),
                    ShopId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_products", x => x.Id);
                    table.UniqueConstraint("AK_products_Id_ShopId", x => new { x.Id, x.ShopId });
                    table.CheckConstraint("ck_products_stock", "\"Stock\" >= 0 AND \"MinimumStock\" >= 0");
                    table.ForeignKey(
                        name: "FK_products_shops_ShopId",
                        column: x => x.ShopId,
                        principalSchema: "finpilot",
                        principalTable: "shops",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "stock_documents",
                schema: "finpilot",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    PaymentDue = table.Column<DateOnly>(type: "date", nullable: true),
                    Counterparty = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CancelledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ObligationId = table.Column<Guid>(type: "uuid", nullable: true),
                    ShopId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_documents", x => x.Id);
                    table.UniqueConstraint("AK_stock_documents_Id_ShopId", x => new { x.Id, x.ShopId });
                    table.CheckConstraint("ck_stock_documents_due", "(\"PaymentDue\" IS NULL AND \"ObligationId\" IS NULL) OR (\"PaymentDue\" IS NOT NULL AND \"PaymentDue\" >= \"Date\" AND \"ObligationId\" IS NOT NULL AND \"Kind\" IN ('receipt', 'sale'))");
                    table.CheckConstraint("ck_stock_documents_kind", "\"Kind\" IN ('receipt', 'sale', 'adjustment', 'stock-out')");
                    table.ForeignKey(
                        name: "FK_stock_documents_obligations_ObligationId_ShopId",
                        columns: x => new { x.ObligationId, x.ShopId },
                        principalSchema: "finpilot",
                        principalTable: "obligations",
                        principalColumns: new[] { "id", "shop_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_stock_documents_shops_ShopId",
                        column: x => x.ShopId,
                        principalSchema: "finpilot",
                        principalTable: "shops",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "stock_lines",
                schema: "finpilot",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sku = table.Column<string>(type: "character varying(48)", maxLength: 48, nullable: false),
                    ProductName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Unit = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Quantity = table.Column<int>(type: "integer", nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,0)", precision: 18, scale: 0, nullable: false),
                    ShopId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_lines", x => x.Id);
                    table.CheckConstraint("ck_stock_lines_values", "\"Quantity\" > 0 AND \"UnitPrice\" >= 0 AND \"UnitPrice\" <> 'NaN'::numeric");
                    table.ForeignKey(
                        name: "FK_stock_lines_products_ProductId_ShopId",
                        columns: x => new { x.ProductId, x.ShopId },
                        principalSchema: "finpilot",
                        principalTable: "products",
                        principalColumns: new[] { "Id", "ShopId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_stock_lines_stock_documents_DocumentId_ShopId",
                        columns: x => new { x.DocumentId, x.ShopId },
                        principalSchema: "finpilot",
                        principalTable: "stock_documents",
                        principalColumns: new[] { "Id", "ShopId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_products_ShopId_Sku",
                schema: "finpilot",
                table: "products",
                columns: new[] { "ShopId", "Sku" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_stock_documents_ObligationId",
                schema: "finpilot",
                table: "stock_documents",
                column: "ObligationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_stock_documents_ObligationId_ShopId",
                schema: "finpilot",
                table: "stock_documents",
                columns: new[] { "ObligationId", "ShopId" });

            migrationBuilder.CreateIndex(
                name: "IX_stock_documents_ShopId_Date",
                schema: "finpilot",
                table: "stock_documents",
                columns: new[] { "ShopId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_stock_lines_DocumentId_ProductId",
                schema: "finpilot",
                table: "stock_lines",
                columns: new[] { "DocumentId", "ProductId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_stock_lines_DocumentId_ShopId",
                schema: "finpilot",
                table: "stock_lines",
                columns: new[] { "DocumentId", "ShopId" });

            migrationBuilder.CreateIndex(
                name: "IX_stock_lines_ProductId_ShopId",
                schema: "finpilot",
                table: "stock_lines",
                columns: new[] { "ProductId", "ShopId" });
            foreach (var table in new[] { "products", "stock_documents", "stock_lines" })
                migrationBuilder.Sql($"ALTER TABLE finpilot.\"{table}\" ENABLE ROW LEVEL SECURITY;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "stock_lines",
                schema: "finpilot");

            migrationBuilder.DropTable(
                name: "products",
                schema: "finpilot");

            migrationBuilder.DropTable(
                name: "stock_documents",
                schema: "finpilot");
        }
    }
}
