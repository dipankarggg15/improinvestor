import "dotenv/config";

const origin = process.env.PRODUCTION_ORIGIN ?? "https://improinvestor.vercel.app";
const email = process.env.PRODUCTION_OWNER_EMAIL ?? process.env.OWNER_EMAIL;
const password = process.env.PRODUCTION_OWNER_PASSWORD;

if (!email || !password) {
  throw new Error("Set PRODUCTION_OWNER_PASSWORD before running production measurements.");
}
const ownerEmail = email;
const ownerPassword = password;

type TimedResponse = {
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
  readonly bytes: number;
  readonly body: string;
};

const cookies = new Map<string, string>();

function storeCookies(headers: Headers) {
  const setCookie = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : headers.get("set-cookie")
      ? [headers.get("set-cookie")!]
      : [];

  for (const cookie of setCookie) {
    const [pair] = cookie.split(";");
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) continue;
    cookies.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
  }
}

function cookieHeader() {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(new URL(path, origin), {
    redirect: "manual",
    ...init,
    headers: {
      ...(cookieHeader() ? { cookie: cookieHeader() } : {}),
      ...(init.headers ?? {}),
    },
  });
  storeCookies(response.headers);
  return response;
}

async function login() {
  const loginPage = await request("/login");
  const html = await loginPage.text();
  const actionName = html.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1];
  if (!actionName) throw new Error("Could not find login server-action field.");

  const form = new FormData();
  form.set(actionName, "");
  form.set("next", "/");
  form.set("email", ownerEmail);
  form.set("password", ownerPassword);

  const response = await request("/login", {
    method: "POST",
    body: form,
  });

  if (response.status !== 303 && response.status !== 302) {
    throw new Error(`Login failed with HTTP ${response.status}.`);
  }
}

async function timed(path: string): Promise<TimedResponse> {
  const startedAt = performance.now();
  const response = await request(path, {
    headers: { accept: "text/html,application/xhtml+xml" },
  });
  const body = await response.text();
  return {
    path,
    status: response.status,
    durationMs: Math.round(performance.now() - startedAt),
    bytes: body.length,
    body,
  };
}

function firstMatch(body: string, pattern: RegExp) {
  return body.match(pattern)?.[1] ?? null;
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function measure(label: string, path: string) {
  await timed(path);
  const samples = [];
  for (let index = 0; index < 3; index += 1) {
    samples.push(await timed(path));
  }
  return {
    label,
    path,
    status: samples.at(-1)?.status,
    samplesMs: samples.map((sample) => sample.durationMs),
    medianMs: median(samples.map((sample) => sample.durationMs)),
    bytes: samples.at(-1)?.bytes,
  };
}

async function main() {
  await login();

  const portfolioPage = await timed("/portfolio");
  const portfolioId = firstMatch(portfolioPage.body, /href="\/portfolio\/([^/"?#]+)"/);
  const counterfactualsPage = await timed("/research/counterfactuals");
  const experimentId = firstMatch(counterfactualsPage.body, /href="\/research\/counterfactuals\/([^/"?#]+)"/);

  const routes = [
    ["/", "/"],
    ["/strategies", "/strategies"],
    ["/portfolio", "/portfolio"],
    ["/portfolio/[id]", portfolioId ? `/portfolio/${portfolioId}` : null],
    ["/analytics", "/analytics"],
    ["/analytics/exits", "/analytics/exits"],
    ["/research/counterfactuals", "/research/counterfactuals"],
    ["experiment detail", experimentId ? `/research/counterfactuals/${experimentId}` : null],
  ] as const;

  const results = [];
  for (const [label, path] of routes) {
    if (!path) {
      results.push({ label, path: null, error: "No matching route discovered." });
      continue;
    }
    results.push(await measure(label, path));
  }

  console.log(JSON.stringify(results, null, 2));
}

main();
