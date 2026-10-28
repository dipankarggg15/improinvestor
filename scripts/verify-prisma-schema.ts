import "dotenv/config";

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type DatabaseColumn = {
  readonly tableName: string;
  readonly columnName: string;
};

async function main() {
  const rows = await prisma.$queryRaw<DatabaseColumn[]>`
    SELECT table_name AS "tableName", column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `;
  const databaseColumns = new Map<string, Set<string>>();
  for (const row of rows) {
    const columns = databaseColumns.get(row.tableName) ?? new Set<string>();
    columns.add(row.columnName);
    databaseColumns.set(row.tableName, columns);
  }

  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const tableName = model.dbName ?? model.name;
    const columns = databaseColumns.get(tableName);
    if (!columns) {
      missingTables.push(tableName);
      continue;
    }
    for (const field of model.fields) {
      if (field.kind === "object") continue;
      const columnName = field.dbName ?? field.name;
      if (!columns.has(columnName)) missingColumns.push(`${tableName}.${columnName}`);
    }
  }

  if (missingTables.length || missingColumns.length) {
    throw new Error(JSON.stringify({ missingTables, missingColumns }));
  }
  console.log(`Prisma schema verified: ${Prisma.dmmf.datamodel.models.length} models match the production database.`);
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown Prisma schema verification failure.");
    process.exit(1);
  });
