# Admin LM Arena Imports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one authenticated administrator safely import a downloaded LM Arena ZIP, inspect it, preview it from a temporary GitHub branch, and atomically publish it into `Melvynx/benchmarks`.

**Architecture:** The browser expands the ZIP and performs an early inspection, then uploads each extracted file through a bounded authenticated route. The server validates every file, creates a GitHub blob, and returns a signed receipt; a draft service assembles only verified receipts into a temporary branch. Publication copies the verified draft artifacts into a single new `main` commit with an updated import manifest, then invalidates the public data cache.

**Tech Stack:** Next.js 16 Route Handlers and Server Components, React 19, Node.js crypto, `fflate` for browser ZIP expansion, GitHub REST Git Database API, Vitest, Testing Library.

**Prerequisite:** Complete
`docs/superpowers/plans/2026-07-26-public-explorer-comparison.md` first. This
plan consumes its task view models, merged import manifest, visual tokens, and
Vitest jsdom setup.

## Global Constraints

- Only the administrator can import, preview drafts, cancel drafts, and publish.
- Store `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, and `BENCHMARK_GITHUB_TOKEN` only in server environment variables.
- The browser never receives a GitHub token or plaintext configured password.
- `BENCHMARK_GITHUB_TOKEN` is restricted to contents read/write on `Melvynx/benchmarks`.
- Do not run package managers, build scripts, shell commands, or uploaded server code.
- Maximum archive size is 20 MB compressed and 75 MB expanded.
- Maximum extracted file count is 1,000; maximum individual file size is 3 MB.
- Every server request stays below Vercel's 4.5 MB body limit.
- Published artifacts remain compatible with the existing Melvynx adapter and preview sandbox.
- GitHub `main` updates are fast-forward only; never force-push.

---

### Task 1: Admin password, session, and request protection

**Files:**
- Create: `src/lib/admin/env.ts`
- Create: `src/lib/admin/auth.ts`
- Create: `src/lib/admin/request-guard.ts`
- Create: `src/lib/admin/login-limiter.ts`
- Create: `tests/admin/auth.test.ts`
- Create: `tests/admin/request-guard.test.ts`
- Create: `tests/config/admin-env.test.ts`

**Interfaces:**
- Produces: `readAdminEnvironment(env)` returning only validated server secrets.
- Produces: `hashAdminPassword`, `verifyAdminPassword`, `createAdminSession`, `verifyAdminSession`, `createCsrfToken`.
- Produces: `requireAdmin(request)`, `requireAdminMutation(request)`.
- Session payload: `{ version: 1; expiresAt: number; csrf: string }`.

- [ ] **Step 1: Write failing password and session tests**

```ts
describe("admin auth", () => {
  it("verifies the configured scrypt password hash", async () => {
    const encoded = await hashAdminPassword("correct horse", Buffer.alloc(16, 7));
    await expect(verifyAdminPassword("correct horse", encoded)).resolves.toBe(true);
    await expect(verifyAdminPassword("wrong", encoded)).resolves.toBe(false);
  });

  it("rejects an expired or tampered session", () => {
    const token = createAdminSession("secret", { now: 1_000, ttlMs: 100 });
    expect(verifyAdminSession(token, "secret", 1_050)).not.toBeNull();
    expect(verifyAdminSession(`${token}x`, "secret", 1_050)).toBeNull();
    expect(verifyAdminSession(token, "secret", 1_101)).toBeNull();
  });
});
```

- [ ] **Step 2: Write failing mutation-guard tests**

```ts
it("requires a signed session, same origin, and matching CSRF token", async () => {
  const csrf = "Y3NyZi10ZXN0LXZhbHVl";
  const env = {
    passwordHash: "scrypt$test$test",
    sessionSecret: "session-secret",
    githubToken: "test-token"
  };
  const session = createAdminSession(env.sessionSecret, {
    now: 1_000,
    ttlMs: 10_000,
    csrf
  });
  const request = new Request("https://hub.example/api/admin/imports", {
    method: "POST",
    headers: {
      cookie: `benchmark_admin=${session}`,
      origin: "https://hub.example",
      "x-csrf-token": csrf
    }
  });
  await expect(requireAdminMutation(request, env)).resolves.toMatchObject({ csrf });
});
```

Add the environment failure test:

```ts
it("reports missing server variables by name without revealing values", () => {
  expect(() => readAdminEnvironment({})).toThrow(
    "Missing server environment variables: ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET, BENCHMARK_GITHUB_TOKEN"
  );
});
```

- [ ] **Step 3: Run tests and verify missing-module failures**

Run: `pnpm test -- tests/admin/auth.test.ts tests/admin/request-guard.test.ts tests/config/admin-env.test.ts`

Expected: FAIL because admin modules do not exist.

- [ ] **Step 4: Implement scrypt and HMAC tokens**

Use this public format:

```ts
type PasswordHash = `scrypt$${string}$${string}`;
type AdminSession = { version: 1; expiresAt: number; csrf: string };
```

Derive 64 bytes with Node `scrypt`, compare fixed-length buffers with
`timingSafeEqual`, and sign base64url JSON with HMAC-SHA256. Session TTL is 8
hours. CSRF values are 32 random bytes.

`readAdminEnvironment` requires exactly `ADMIN_PASSWORD_HASH`,
`ADMIN_SESSION_SECRET`, and `BENCHMARK_GITHUB_TOKEN`; its errors contain missing
variable names but never values.

- [ ] **Step 5: Implement request guards and best-effort limiter**

`requireAdminMutation` checks:

1. valid signed `benchmark_admin` cookie;
2. `Origin` equals `new URL(request.url).origin`;
3. `x-csrf-token` equals the session CSRF using constant-time comparison.

The login limiter permits five attempts per normalized IP hash in ten minutes
within one function instance and returns a retry-after value. Never log
passwords, cookies, tokens, CSRF values, or request bodies.

- [ ] **Step 6: Run tests**

Run: `pnpm test -- tests/admin/auth.test.ts tests/admin/request-guard.test.ts tests/config/admin-env.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin tests/admin tests/config/admin-env.test.ts
git commit -m "feat: protect admin import operations"
```

### Task 2: Login route and protected admin page

**Files:**
- Create: `src/app/api/admin/session/route.ts`
- Create: `src/app/admin/import/page.tsx`
- Create: `src/components/admin-login-form.tsx`
- Create: `src/components/admin-import-wizard.tsx`
- Create: `tests/components/admin-login-form.test.tsx`
- Create: `tests/admin/session-route.test.ts`

**Interfaces:**
- `POST /api/admin/session` accepts `{ password: string }`, sets the signed cookie, and returns `{ csrf }`.
- `DELETE /api/admin/session` clears the cookie.
- `/admin/import` renders login or the import shell according to `await cookies()`.

- [ ] **Step 1: Write failing login UI and route tests**

```tsx
it("submits the password without retaining it after a failed login", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: "Accès refusé" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    })
  ));
  render(<AdminLoginForm />);
  await userEvent.type(screen.getByLabelText("Mot de passe administrateur"), "wrong");
  await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
  expect(await screen.findByText("Accès refusé")).toBeInTheDocument();
  expect(screen.getByLabelText("Mot de passe administrateur")).toHaveValue("");
});
```

Route tests must assert `HttpOnly`, `Secure` in production, `SameSite=Strict`,
`Path=/`, and `Max-Age=28800`.

- [ ] **Step 2: Run tests and verify failures**

Run: `pnpm test -- tests/components/admin-login-form.test.tsx tests/admin/session-route.test.ts`

Expected: FAIL because the route and form are missing.

- [ ] **Step 3: Implement the session route**

Use `await cookies()` in the Route Handler, generic `401` copy, limiter
`Retry-After`, and environment validation that fails closed when any admin
secret is absent.

- [ ] **Step 4: Implement the protected page shell**

The logged-out view contains only purpose, privacy warning, and login. The
logged-in view receives the session CSRF server-side and renders a minimal
`AdminImportWizard` shell containing “Import bientôt disponible”. Task 8
replaces that shell with the complete four-step implementation.

- [ ] **Step 5: Run tests, lint, and typecheck**

Run: `pnpm test -- tests/components/admin-login-form.test.tsx tests/admin/session-route.test.ts && pnpm lint && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/session/route.ts src/app/admin/import/page.tsx src/components/admin-login-form.tsx src/components/admin-import-wizard.tsx tests/admin/session-route.test.ts tests/components/admin-login-form.test.tsx
git commit -m "feat: add admin login"
```

### Task 3: Browser archive inspection and server file policy

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/lib/imports/types.ts`
- Create: `src/lib/imports/policy.ts`
- Create: `src/lib/imports/archive.ts`
- Create: `tests/imports/archive.test.ts`
- Create: `tests/imports/policy.test.ts`

**Interfaces:**
- `inspectArchive(data: Uint8Array): Promise<ArchiveInspection>`.
- `validateImportFile(input: { path; bytes; contentType }): ValidatedImportFile`.
- `ArchiveInspection` contains normalized files, detected type, entry point, compressed/expanded size, and warnings.

- [ ] **Step 1: Install the browser-only ZIP dependency**

Run: `pnpm add fflate`

Expected: `fflate` appears in dependencies and the lockfile changes.

- [ ] **Step 2: Write failing archive tests**

```ts
it("detects a built static archive beneath one common root folder", async () => {
  const zip = zipSync({
    "download/index.html": strToU8("<html></html>"),
    "download/assets/app.js": strToU8("console.log('ok')")
  });
  const result = await inspectArchive(zip);
  expect(result).toMatchObject({ type: "standalone-html", entryPoint: "index.html", fileCount: 2 });
  expect(result.files.map((file) => file.path)).toContain("assets/app.js");
});

it("detects a supported Vite React entry", async () => {
  const zip = zipSync({
    "index.html": strToU8('<script type="module" src="/src/main.tsx"></script>'),
    "package.json": strToU8('{"dependencies":{"react":"^19.0.0"}}'),
    "src/main.tsx": strToU8("export default null")
  });
  expect((await inspectArchive(zip)).type).toBe("vite-react");
});
```

- [ ] **Step 3: Write failing safety-policy tests**

Cover `../`, absolute paths, duplicate normalized paths, `.env`, private keys,
source maps, nested archives, unsupported binaries, more than 1,000 files, more
than 75 MB expanded, a file above 3 MB, and suspicious credential text.

- [ ] **Step 4: Run tests and verify failures**

Run: `pnpm test -- tests/imports/archive.test.ts tests/imports/policy.test.ts`

Expected: FAIL because import modules are missing.

- [ ] **Step 5: Implement shared constants and file validation**

```ts
export const IMPORT_LIMITS = {
  compressedBytes: 20_000_000,
  expandedBytes: 75_000_000,
  fileBytes: 3_000_000,
  fileCount: 1_000
} as const;

export type ImportProjectType = "standalone-html" | "vite-react";
export type ValidatedImportFile = {
  path: string;
  bytes: Uint8Array;
  contentType: string;
  text: boolean;
};
```

Allow web text (`html`, `css`, `js`, `jsx`, `ts`, `tsx`, `json`, `svg`, common
text) plus PNG, JPEG, WebP, GIF, AVIF, WOFF, and WOFF2. Reject executable magic
bytes and likely private-key/credential assignments in text.

- [ ] **Step 6: Implement archive inspection**

Use `fflate.unzip` asynchronously. Strip exactly one common wrapper directory,
then pass every extracted file through the same shared path/type/size policy
used server-side. Do not evaluate HTML or JavaScript.

- [ ] **Step 7: Run tests**

Run: `pnpm test -- tests/imports/archive.test.ts tests/imports/policy.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/imports tests/imports
git commit -m "feat: validate LM Arena archives"
```

### Task 4: GitHub write transport

**Files:**
- Create: `src/lib/github/write-client.ts`
- Create: `tests/github/write-client.test.ts`
- Create: `tests/fixtures/in-memory-git-writer.ts`

**Interfaces:**
- Produces `BenchmarkGitWriter` and `GitHubBenchmarkWriter`.
- Produces test-only `InMemoryGitWriter` implementing every
  `BenchmarkGitWriter` method and recording blobs, tree entries, commits, refs,
  update attempts, and forced updates.
- All methods are pinned internally to owner `Melvynx`, repo `benchmarks`.

```ts
export type GitTreeEntry = {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string;
};

export interface BenchmarkGitWriter {
  getHead(ref: string): Promise<{ commitSha: string; treeSha: string }>;
  createBlob(bytes: Uint8Array): Promise<string>;
  createTree(baseTreeSha: string, entries: GitTreeEntry[]): Promise<string>;
  createCommit(message: string, treeSha: string, parentSha: string): Promise<string>;
  createBranch(branch: string, commitSha: string): Promise<void>;
  updateBranch(branch: string, commitSha: string): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
  listBranches(prefix: string): Promise<string[]>;
  readText(path: string, ref: string): Promise<string | null>;
  listTree(ref: string): Promise<Array<{ path: string; type: string; sha: string }>>;
}
```

- [ ] **Step 1: Write failing transport request tests**

Assert the exact GitHub endpoints, `X-GitHub-Api-Version: 2026-03-10`, fixed
repository, `force:false` on ref updates, base64 blob encoding, safe error text,
and no token in thrown errors.

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test -- tests/github/write-client.test.ts`

Expected: FAIL because the writer is missing.

- [ ] **Step 3: Implement the writer**

Use REST Git Database endpoints for blobs, trees, commits, and refs. The
constructor accepts `fetcher` and token for tests, but production construction
reads `BENCHMARK_GITHUB_TOKEN` only on the server. Reject ref/path inputs that do
not match internal branch/path validators.

`listBranches("imports/")` uses the matching-refs endpoint and returns only refs
that pass the internal import-branch validator.

- [ ] **Step 4: Run tests**

Run: `pnpm test -- tests/github/write-client.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/write-client.ts tests/github/write-client.test.ts tests/fixtures/in-memory-git-writer.ts
git commit -m "feat: add scoped GitHub write client"
```

### Task 5: Draft receipts and bounded file upload

**Files:**
- Create: `src/lib/imports/receipts.ts`
- Create: `src/lib/imports/draft-service.ts`
- Create: `src/app/api/admin/imports/route.ts`
- Create: `src/app/api/admin/imports/files/route.ts`
- Create: `src/app/api/admin/imports/finalize/route.ts`
- Create: `tests/imports/receipts.test.ts`
- Create: `tests/imports/draft-service.test.ts`

**Interfaces:**
- `POST /api/admin/imports` returns `{ draftId, uploadToken }`.
- `POST /api/admin/imports/files` accepts one raw file and returns `{ receipt }`.
- `POST /api/admin/imports/finalize` accepts metadata plus all receipts and returns `{ draftToken, previewUrl }`.
- Receipts bind `{ draftId; path; blobSha; size; contentType; expiresAt }`.

- [ ] **Step 1: Write failing receipt tests**

```ts
it("rejects tampering, expiration, and a receipt from another draft", () => {
  const now = 1_785_072_000_000;
  const validReceipt = {
    version: 1 as const,
    draftId: "1785072000-4f3a2d1c",
    path: "index.html",
    blobSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    size: 13,
    contentType: "text/html",
    expiresAt: now + 60_000
  };
  const receipt = signFileReceipt(validReceipt, "secret");
  expect(verifyFileReceipt(receipt, "secret", validReceipt.draftId, now)).toEqual(validReceipt);
  expect(verifyFileReceipt(`${receipt}x`, "secret", validReceipt.draftId, now)).toBeNull();
  expect(verifyFileReceipt(receipt, "secret", "another", now)).toBeNull();
});
```

- [ ] **Step 2: Write failing draft finalization tests**

```ts
it("assembles only verified receipts into an unpredictable draft branch", async () => {
  const writer = new InMemoryGitWriter();
  const metadata = {
    task: "gmail-clone",
    model: "model-a",
    harness: "lmarena" as const,
    createdAt: "2026-07-26T12:00:00.000Z",
    notes: ""
  };
  const receipts = [
    signFileReceipt({
      version: 1,
      draftId: "1785072000-4f3a2d1c",
      path: "index.html",
      blobSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      size: 13,
      contentType: "text/html",
      expiresAt: 1_785_158_400_000
    }, "test-signing-secret")
  ];
  const result = await finalizeDraft(
    { metadata, receipts, draftId: "1785072000-4f3a2d1c" },
    writer,
    "test-signing-secret"
  );
  expect(writer.createdTreeEntries).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: "benchmarks/gmail-clone/2026-07-26-lmarena-model-a/index.html" }),
    expect.objectContaining({ path: "runs/20260726T120000Z-model-a-lmarena/data/gmail-clone/metadata.json" })
  ]));
  expect(result.branch).toMatch(/^imports\/[a-z0-9-]{20,}$/);
});
```

- [ ] **Step 3: Run tests and verify failures**

Run: `pnpm test -- tests/imports/receipts.test.ts tests/imports/draft-service.test.ts`

Expected: FAIL because receipt and draft services are missing.

- [ ] **Step 4: Implement signed draft and file receipts**

Reuse the HMAC envelope from admin auth with distinct purpose strings
`import-draft` and `import-file`. Receipt TTL is 24 hours. Draft IDs use at least
128 random bits and lowercase URL-safe encoding.

- [ ] **Step 5: Implement bounded upload route**

Require admin mutation auth, `content-length <= 3_000_000`, a signed draft token,
and encoded path/content-type headers. Read the body once, validate it with
`validateImportFile`, create one GitHub blob, and return one signed receipt.

- [ ] **Step 6: Implement draft finalization**

Verify every receipt, enforce uniqueness and aggregate limits, detect the
project entry again from receipt paths, generate normalized Melvynx metadata,
create the draft tree/commit/ref, and return a signed read-only draft token.

The signed draft payload is:

```ts
export type DraftTokenPayload = {
  version: 1;
  draftId: string;
  branch: string;
  commitSha: string;
  task: string;
  appSlug: string;
  runId: string;
  expiresAt: number;
};
```

The begin route also calls `cleanupStaleDrafts(writer, now)` as a best-effort
operation. Draft branch names start with
`` `imports/${Math.floor(now / 1000)}-` ``, so cleanup can remove matching
branches older than 24 hours without reading uploaded metadata.

- [ ] **Step 7: Run tests**

Run: `pnpm test -- tests/imports/receipts.test.ts tests/imports/draft-service.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/imports/receipts.ts src/lib/imports/draft-service.ts src/app/api/admin/imports tests/imports/receipts.test.ts tests/imports/draft-service.test.ts
git commit -m "feat: assemble verified import drafts"
```

### Task 6: Draft preview through the existing sandbox

**Files:**
- Create: `src/lib/visuals/preview-context.ts`
- Create: `src/app/api/admin/imports/[draftId]/visual/route.ts`
- Create: `src/app/api/admin/imports/[draftId]/visual/asset/[...path]/route.ts`
- Create: `src/app/api/admin/imports/[draftId]/visual/vendor/[...path]/route.ts`
- Create: `tests/visuals/preview-context.test.ts`
- Modify: `src/app/api/runs/[id]/visual/route.ts`
- Modify: `src/app/api/runs/[id]/visual/asset/[...path]/route.ts`
- Modify: `src/app/api/runs/[id]/visual/vendor/[...path]/route.ts`

**Interfaces:**
- `PublicPreviewContext` and `DraftPreviewContext` expose the same fixed ref,
  artifact directory, entry path, asset base URL, and safe reader.
- Draft subresources authorize with a short-lived signed `preview` query token,
  not the admin cookie.

- [ ] **Step 1: Write the failing context tests**

```ts
it("never accepts an arbitrary draft ref or artifact directory from query parameters", async () => {
  const signedTokenForCommitA = signDraftToken({
    version: 1,
    draftId: "1785072000-4f3a2d1c",
    branch: "imports/1785072000-4f3a2d1c",
    commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    task: "gmail-clone",
    appSlug: "2026-07-26-lmarena-model-a",
    runId: "20260726T120000Z-model-a-lmarena",
    expiresAt: 1_785_158_400_000
  }, "test-signing-secret");
  const context = await resolveDraftPreviewContext({
    draftId: "1785072000-4f3a2d1c",
    token: signedTokenForCommitA,
    requestedPath: "src/main.tsx"
  });
  expect(context.ref).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  expect(context.artifactDirectory).toBe("benchmarks/gmail-clone/2026-07-26-lmarena-model-a");
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test -- tests/visuals/preview-context.test.ts`

Expected: FAIL because the preview context is missing.

- [ ] **Step 3: Extract shared public preview resolution**

Move repeated run/source/visual resolution from the three public preview routes
into `resolvePublicPreviewContext(runId)`. Keep response headers, CSP,
transformations, vendor rewrite, CORS, and sandbox behavior unchanged.

- [ ] **Step 4: Implement draft preview routes**

Verify the signed token binds the draft ID, immutable draft commit SHA, task,
app slug, and expiry. Use the commit SHA—not the slash-containing branch name—
for raw GitHub reads. Derive all GitHub paths server-side. Reuse the same HTML
injection, module transform, stylesheet compiler, safe binary types, and esm.sh
restrictions as public previews.

- [ ] **Step 5: Run preview regression tests**

Run: `pnpm test -- tests/visuals tests/components/run-visual.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/visuals/preview-context.ts 'src/app/api/admin/imports/[draftId]/visual' 'src/app/api/runs/[id]/visual' tests/visuals/preview-context.test.ts
git commit -m "feat: preview authenticated import drafts"
```

### Task 7: Atomic publication, conflict retry, and cleanup

**Files:**
- Create: `src/lib/imports/publish-service.ts`
- Create: `src/app/api/admin/imports/[draftId]/publish/route.ts`
- Create: `src/app/api/admin/imports/[draftId]/route.ts`
- Create: `tests/imports/publish-service.test.ts`
- Modify: `src/lib/imports/draft-service.ts`
- Modify: `src/lib/storage/import-manifest.ts`

**Interfaces:**
- `publishDraft(input, writer): Promise<{ run: NormalizedRun; cleanupWarning: string | null }>`
- `DELETE /api/admin/imports/[draftId]` cancels a verified draft.
- `POST /api/admin/imports/[draftId]/publish` publishes then invalidates `melvynx-imports`.

- [ ] **Step 1: Write failing atomic publish tests**

```ts
const draftToken = signDraftToken({
  version: 1,
  draftId: "1785072000-4f3a2d1c",
  branch: "imports/1785072000-4f3a2d1c",
  commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  task: "gmail-clone",
  appSlug: "2026-07-26-lmarena-model-a",
  runId: "20260726T120000Z-model-a-lmarena",
  expiresAt: 1_785_158_400_000
}, "test-signing-secret");

it("updates artifacts, metadata, and imports/index.json in one main commit", async () => {
  const writer = InMemoryGitWriter.withDraft(draftToken);
  const result = await publishDraft({ draftToken }, writer);
  expect(writer.mainCommits).toHaveLength(1);
  expect(writer.mainCommits[0].paths).toEqual(expect.arrayContaining([
    "benchmarks/gmail-clone/2026-07-26-lmarena-model-a/index.html",
    "runs/20260726T120000Z-model-a-lmarena/data/gmail-clone/metadata.json",
    "imports/index.json"
  ]));
  expect(result.run.id).toBe("melvynx-benchmarks-20260726T120000Z-model-a-lmarena");
});

it("rebuilds once against a new main head after a non-fast-forward conflict", async () => {
  const writer = InMemoryGitWriter.withDraft(draftToken);
  writer.failFirstMainUpdate = true;
  await publishDraft({ draftToken }, writer);
  expect(writer.mainUpdateAttempts).toBe(2);
  expect(writer.forcedUpdates).toBe(0);
});
```

- [ ] **Step 2: Write failing idempotency and cleanup tests**

Test an already-present run ID, a failed branch deletion after successful
publish, canceling a draft, deleting only stale timestamped import branches,
retaining recent drafts, and rejecting any draft tree entry outside its exact
artifact and metadata prefixes.

- [ ] **Step 3: Run tests and verify failures**

Run: `pnpm test -- tests/imports/publish-service.test.ts`

Expected: FAIL because the publish service is missing.

- [ ] **Step 4: Implement publication**

Read the latest main head and manifest, validate the draft tree, append exactly
one normalized run, create a main-based tree, create a commit, and update `main`
with `force:false`. On conflict, repeat from the latest head once. Treat an
existing identical ID as idempotent success; reject a conflicting ID.

- [ ] **Step 5: Implement publish and cancel routes**

Both routes require `requireAdminMutation`. After successful publication:

```ts
revalidateTag("melvynx-imports", { expire: 0 });
revalidatePath("/");
revalidatePath(`/tasks/${encodeURIComponent(run.task!)}`);
revalidatePath(`/runs/${encodeURIComponent(run.id)}`);
```

Return the public run link even when branch deletion produces a cleanup warning.

- [ ] **Step 6: Run tests**

Run: `pnpm test -- tests/imports/publish-service.test.ts tests/storage/import-manifest.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/imports/publish-service.ts src/lib/imports/draft-service.ts 'src/app/api/admin/imports/[draftId]' src/lib/storage/import-manifest.ts tests/imports/publish-service.test.ts
git commit -m "feat: publish import drafts atomically"
```

### Task 8: Four-step admin import wizard

**Files:**
- Modify: `src/components/admin-import-wizard.tsx`
- Create: `src/components/import-dropzone.tsx`
- Create: `src/components/import-preview.tsx`
- Create: `tests/components/admin-import-wizard.test.tsx`
- Modify: `src/app/admin/import/page.tsx`

**Interfaces:**
- `AdminImportWizard({ csrf, tasks })` owns metadata, local archive inspection,
  bounded upload progress, draft preview, publish, retry, and cancel.
- Uses the Task 2 task catalog; new tasks are not accepted.

- [ ] **Step 1: Write the failing happy-path test**

```tsx
async function chooseTaskModelAndArchive() {
  await userEvent.selectOptions(screen.getByLabelText("Task"), "gmail-clone");
  await userEvent.type(screen.getByLabelText("Modèle"), "model-a");
  const zip = zipSync({ "index.html": strToU8("<html><body>OK</body></html>") });
  await userEvent.upload(
    screen.getByLabelText("Archive LM Arena"),
    new File([zip], "gmail-model-a.zip", { type: "application/zip" })
  );
}

it("moves from metadata to validation, preview, and public success", async () => {
  render(<AdminImportWizard csrf="csrf" tasks={["gmail-clone"]} />);
  await chooseTaskModelAndArchive();
  expect(await screen.findByText("Archive valide")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));
  expect(await screen.findByTitle("Prévisualisation du run importé")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Publier le run" }));
  expect(await screen.findByRole("link", { name: "Voir le run public" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Write failing validation and retry tests**

Cover unsupported archive, rejected server file, upload progress, preview load
failure, publish failure retaining the draft, retry success, cancel, and password
session expiry.

- [ ] **Step 3: Run the test and verify failure**

Run: `pnpm test -- tests/components/admin-import-wizard.test.tsx`

Expected: FAIL because wizard components are missing.

- [ ] **Step 4: Implement metadata and archive steps**

Required fields are existing task, trimmed model, and ZIP. Harness is visibly
fixed to `lmarena`. Optional fields are generation time and notes. Show the
public-draft-branch disclosure before upload. Preserve fields after errors.

- [ ] **Step 5: Implement bounded upload and preview**

Upload at most three files concurrently. Each request sends one file with
`x-upload-token`, `x-import-path`, `content-type`, and `x-csrf-token`. Collect
receipts only from successful responses. Finalize once all files succeed.

Render the preview iframe with sandbox restrictions and its signed preview URL.
Require its load event before enabling Publish.

- [ ] **Step 6: Implement publish, retry, cancel, and success**

On publish failure, keep the draft token. On success, clear archive bytes and
receipts from memory and show the public run/task links plus any cleanup warning.
Logout clears local wizard state before deleting the session.

- [ ] **Step 7: Run component tests**

Run: `pnpm test -- tests/components/admin-import-wizard.test.tsx tests/components/admin-login-form.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin-import-wizard.tsx src/components/import-dropzone.tsx src/components/import-preview.tsx src/app/admin/import/page.tsx tests/components/admin-import-wizard.test.tsx
git commit -m "feat: add LM Arena import wizard"
```

### Task 9: Configuration, documentation, and release verification

**Files:**
- Create: `.env.example`
- Create: `scripts/hash-admin-password.ts`
- Create: `tests/config/admin-config-docs.test.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- `pnpm admin:hash-password` prints only an encoded scrypt hash after prompting
  interactively; it never echoes the password or writes an env file.
- `.env.example` contains names and deliberately invalid example values, never
  usable secrets.

- [ ] **Step 1: Write the failing configuration documentation test**

```ts
import { readFile } from "node:fs/promises";

it("ships safe admin setup examples and the password hash command", async () => {
  const [packageText, envText, readme] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile(".env.example", "utf8"),
    readFile("README.md", "utf8")
  ]);
  expect(JSON.parse(packageText).scripts["admin:hash-password"]).toBe(
    "tsx scripts/hash-admin-password.ts"
  );
  expect(envText).toContain("ADMIN_PASSWORD_HASH=scrypt$INVALID_");
  expect(envText).not.toMatch(/github_pat_|ghp_/);
  expect(readme).toContain("Contents: Read and write");
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test -- tests/config/admin-config-docs.test.ts`

Expected: FAIL because `.env.example` and the package script do not exist.

- [ ] **Step 3: Add safe configuration tooling**

`.env.example`:

```dotenv
ADMIN_PASSWORD_HASH=scrypt$INVALID_EXAMPLE_SALT$INVALID_EXAMPLE_HASH
ADMIN_SESSION_SECRET=INVALID_REPLACE_WITH_32_RANDOM_BYTES
BENCHMARK_GITHUB_TOKEN=INVALID_FINE_GRAINED_TOKEN
```

Add `"admin:hash-password": "tsx scripts/hash-admin-password.ts"` to scripts.
Use a TTY-hidden prompt and print only the final hash.

- [ ] **Step 4: Document Vercel and GitHub setup**

README must state:

- create a fine-grained token selecting only `Melvynx/benchmarks` with Contents
  read/write;
- set the three environment variables in Vercel;
- never paste or commit their values;
- ZIP support and limits;
- draft branches are unlisted but technically public until canceled/published;
- how to run the import locally without publishing by using a mocked writer in
  tests, and how to exercise real publication only when explicitly intended.

- [ ] **Step 5: Run the complete delivery gate**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`

Expected: every command exits 0; no secret value appears in output.

- [ ] **Step 6: Perform bounded manual smoke checks**

Run `pnpm dev`, then verify:

1. logged-out admin cannot access import mutations;
2. correct login opens the wizard;
3. a tiny static ZIP reaches preview with a test repository writer;
4. a traversal ZIP is rejected before upload;
5. public Explorer and comparison still work with no admin env configured.

- [ ] **Step 7: Review the final diff for scope and secrets**

Run:

```bash
git status --short
git diff --check
git diff --stat
rg -n "github_pat_|ghp_|ADMIN_PASSWORD=|BENCHMARK_GITHUB_TOKEN=" . -g '!node_modules' -g '!.git'
```

Expected: only intended files are changed; secret scan finds no real credential.

- [ ] **Step 8: Commit**

```bash
git add .env.example README.md package.json scripts/hash-admin-password.ts tests/config/admin-config-docs.test.ts
git commit -m "docs: configure secure LM Arena imports"
```
