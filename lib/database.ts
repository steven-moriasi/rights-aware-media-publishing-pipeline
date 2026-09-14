import postgres from "postgres";

export type Database = ReturnType<typeof postgres>;

let database: Database | null = null;

export function getDatabase(): Database {
  if (database === null) {
    database = postgres(requiredEnvironment("DATABASE_URL"), {
      max: 10,
      transform: postgres.camel,
    });
  }
  return database;
}

export function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
