import "dotenv/config";

type UrlShape = {
  readonly name: string;
  readonly present: boolean;
  readonly hostKind?: string;
  readonly port?: string;
  readonly hasPgbouncer?: boolean;
  readonly connectionLimit?: string;
  readonly sslmode?: string;
  readonly warning?: string;
};

const shapes = [
  describeDatabaseUrl("DATABASE_URL"),
  describeDatabaseUrl("DIRECT_URL"),
  describePublicValue("NEXT_PUBLIC_SUPABASE_URL"),
  describePublicValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  describePublicValue("OWNER_EMAIL"),
];

for (const shape of shapes) {
  console.log(JSON.stringify(shape));
}

function describeDatabaseUrl(name: string): UrlShape {
  const value = process.env[name];
  if (!value) return { name, present: false, warning: "missing" };

  try {
    const url = new URL(value);
    const hostKind = url.hostname.includes("pooler.supabase.com")
      ? "supabase-pooler"
      : url.hostname.includes("supabase.co")
        ? "supabase-direct"
        : "other";

    return {
      name,
      present: true,
      hostKind,
      port: url.port || "default",
      hasPgbouncer: url.searchParams.get("pgbouncer") === "true",
      connectionLimit: url.searchParams.get("connection_limit") ?? "not-set",
      sslmode: url.searchParams.get("sslmode") ?? "not-set",
      warning: warningFor(name, hostKind, url),
    };
  } catch {
    return { name, present: true, warning: "not a parseable URL" };
  }
}

function describePublicValue(name: string) {
  return {
    name,
    present: Boolean(process.env[name]),
  };
}

function warningFor(name: string, hostKind: string, url: URL) {
  if (name === "DATABASE_URL") {
    if (hostKind !== "supabase-pooler") return "expected Supabase transaction pooler for serverless application queries";
    if (url.port !== "6543") return "verify this is transaction pooling; Supabase transaction pooler commonly uses port 6543";
    if (url.searchParams.get("pgbouncer") !== "true") return "consider pgbouncer=true for Supabase transaction pooling with Prisma";
    if (!url.searchParams.get("connection_limit")) return "consider connection_limit=1 for Vercel/serverless Prisma";
  }

  if (name === "DIRECT_URL" && hostKind === "supabase-pooler") {
    return "expected direct database URL for Prisma migrations/admin operations";
  }

  return undefined;
}
