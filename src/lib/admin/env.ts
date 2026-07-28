import "server-only";

export type AdminEnvironment = {
  passwordHash: string;
  sessionSecret: string;
  githubToken: string;
};

type ServerEnvironment = Record<string, string | undefined>;

const requiredVariables = ["ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET", "BENCHMARK_GITHUB_TOKEN"] as const;

export function readAdminEnvironment(env: ServerEnvironment = process.env): AdminEnvironment {
  const missing = requiredVariables.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing server environment variables: ${missing.join(", ")}`);

  const invalid = requiredVariables.filter((name) => {
    const value = env[name]!;
    return value.includes("INVALID_")
      || (name === "ADMIN_SESSION_SECRET" && Buffer.byteLength(value, "utf8") < 32);
  });
  if (invalid.length) throw new Error(`Invalid server environment variables: ${invalid.join(", ")}`);

  return {
    passwordHash: env.ADMIN_PASSWORD_HASH!,
    sessionSecret: env.ADMIN_SESSION_SECRET!,
    githubToken: env.BENCHMARK_GITHUB_TOKEN!
  };
}
