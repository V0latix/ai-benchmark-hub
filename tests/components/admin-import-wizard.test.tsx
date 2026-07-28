// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminImportWizard } from "../../src/components/admin-import-wizard";
import { adminPreviewMessageType } from "../../src/lib/visuals/preview";

const csrf = "csrf-value";
const tasks = ["figma-clone", "gmail-clone"];
const previewNonce = "cd".repeat(16);
const previewSetupToken = "preview-setup-token";
const previewUrl = "/api/admin/imports/draft-1/visual";
const previewSetupUrl = "/api/admin/imports/draft-1/visual/setup";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function makeArchive(
  name = "gmail-model-a.zip",
  files: Record<string, Uint8Array> = {
    "index.html": strToU8("<html><body>OK</body></html>")
  }
) {
  return new File([zipSync(files)], name, { type: "application/zip" });
}

async function identifyRun(file = makeArchive()) {
  fireEvent.change(screen.getByLabelText("Task"), { target: { value: "gmail-clone" } });
  fireEvent.change(screen.getByLabelText("Modèle"), { target: { value: "  model-a  " } });
  fireEvent.change(screen.getByLabelText("Archive LM Arena"), { target: { files: [file] } });
  expect(await screen.findByText("Archive valide")).toBeInTheDocument();
}

function successfulFetch(options: {
  publishFailures?: number;
  cleanupWarning?: string | null;
  invalidationWarning?: string | null;
  previewStatus?: number;
} = {}) {
  let receipt = 0;
  let publishAttempts = 0;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/admin/imports" && init?.method === "POST") {
      return jsonResponse({ draftId: "draft-1", uploadToken: "upload-token" });
    }
    if (url === "/api/admin/imports/files") {
      receipt += 1;
      return jsonResponse({ receipt: `receipt-${receipt}` });
    }
    if (url === "/api/admin/imports/finalize") {
      return jsonResponse({
        draftToken: "draft-token",
        previewUrl,
        previewNonce,
        previewSetupToken
      });
    }
    if (url === previewSetupUrl && init?.method === "POST") {
      const status = options.previewStatus ?? 200;
      return new Response(null, { status: status >= 200 && status < 300 ? 204 : status });
    }
    if (url === "/api/admin/imports/draft-1/publish") {
      publishAttempts += 1;
      if (publishAttempts <= (options.publishFailures ?? 0)) {
        return jsonResponse({ error: "Publication impossible; le brouillon reste disponible" }, 409);
      }
      return jsonResponse({
        run: { id: "melvynx-run-1", task: "gmail-clone" },
        runUrl: "/runs/melvynx-run-1",
        taskUrl: "/tasks/gmail-clone",
        cleanupWarning: options.cleanupWarning ?? null,
        invalidationWarning: options.invalidationWarning ?? null
      });
    }
    if (url === "/api/admin/imports/draft-1" && init?.method === "DELETE") {
      return jsonResponse({ cancelled: true });
    }
    if (url === "/api/admin/session" && init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  });
}

function postPreviewMessage(
  iframe: HTMLIFrameElement,
  state: "ready" | "error",
  nonce = previewNonce,
  source: MessageEventSource | null = iframe.contentWindow,
  generation = 1
) {
  fireEvent(window, new MessageEvent("message", {
    data: { type: adminPreviewMessageType, state, nonce, generation },
    source
  }));
}

function markPreviewReady(iframe: HTMLIFrameElement) {
  fireEvent.load(iframe);
  postPreviewMessage(iframe, "ready", previewNonce, iframe.contentWindow, 1);
  postPreviewMessage(iframe, "ready", previewNonce, iframe.contentWindow, 2);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AdminImportWizard", () => {
  it("moves from identification to validation, loaded preview, and public success", async () => {
    vi.stubGlobal("fetch", successfulFetch({
      cleanupWarning: "La branche temporaire reste à nettoyer",
      invalidationWarning: "Le cache public se mettra à jour sous peu"
    }));
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun();
    expect(screen.getByText("Archive valide").closest("[role='status']")).not.toBeNull();
    expect(screen.getByText(/branche temporaire.*techniquement publique/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));
    const preview = await screen.findByTitle("Prévisualisation du run importé");
    expect(fetch).toHaveBeenCalledWith(
      previewSetupUrl,
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-csrf-token": csrf
        }),
        body: JSON.stringify({ previewSetupToken })
      })
    );
    expect(preview).toHaveAttribute("src", previewUrl);
    expect(preview).not.toHaveAttribute("src", expect.stringContaining(previewSetupToken));
    expect(preview).toHaveAttribute("sandbox", "allow-scripts");
    expect(screen.getByRole("button", { name: "Publier le run" })).toBeDisabled();

    fireEvent.load(preview);
    expect(screen.getByRole("button", { name: "Publier le run" })).toBeDisabled();
    postPreviewMessage(preview as HTMLIFrameElement, "ready", "ef".repeat(16));
    postPreviewMessage(preview as HTMLIFrameElement, "ready", previewNonce, window);
    expect(screen.getByRole("button", { name: "Publier le run" })).toBeDisabled();
    postPreviewMessage(preview as HTMLIFrameElement, "ready", previewNonce, (preview as HTMLIFrameElement).contentWindow, 1);
    postPreviewMessage(preview as HTMLIFrameElement, "ready", previewNonce, (preview as HTMLIFrameElement).contentWindow, 2);
    expect(screen.getByText("Aperçu chargé")).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Publier le run" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Publier le run" }));

    expect(await screen.findByRole("link", { name: "Voir le run public" })).toHaveAttribute(
      "href",
      "/runs/melvynx-run-1"
    );
    expect(screen.getByRole("link", { name: "Voir la task" })).toHaveAttribute(
      "href",
      "/tasks/gmail-clone"
    );
    expect(screen.getByText("La branche temporaire reste à nettoyer")).toBeInTheDocument();
    expect(screen.getByText("Le cache public se mettra à jour sous peu")).toBeInTheDocument();
    expect(screen.queryByText("Archive valide")).not.toBeInTheDocument();
  });

  it("trims model metadata and sends each raw file with the exact guarded upload headers", async () => {
    const fetcher = successfulFetch();
    vi.stubGlobal("fetch", fetcher);
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun(makeArchive("project.zip", {
      "index.html": strToU8("<html></html>"),
      "assets/app.js": strToU8("console.log('ok')")
    }));
    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));
    await screen.findByTitle("Prévisualisation du run importé");

    const uploadCalls = fetcher.mock.calls.filter(([url]) => url === "/api/admin/imports/files");
    expect(uploadCalls).toHaveLength(2);
    for (const [, init] of uploadCalls) {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-csrf-token")).toBe(csrf);
      expect(headers.get("x-import-upload-token")).toBe("upload-token");
      expect(headers.get("x-import-path")).toBeTruthy();
      expect(headers.get("x-import-content-type")).toBeTruthy();
      expect(headers.get("content-type")).toBeTruthy();
      expect(init?.body).toBeInstanceOf(Uint8Array);
    }

    const finalizeCall = fetcher.mock.calls.find(([url]) => url === "/api/admin/imports/finalize");
    const finalizeBody = JSON.parse(String(finalizeCall?.[1]?.body));
    expect(finalizeBody.metadata).toMatchObject({
      task: "gmail-clone",
      model: "model-a",
      harness: "lmarena",
      notes: ""
    });
    expect(finalizeBody.metadata.createdAt).toMatch(/Z$/);
  });

  it("never uploads more than three files concurrently and announces progress", async () => {
    const pending: Array<() => void> = [];
    let active = 0;
    let maximumActive = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/admin/imports") {
        return Promise.resolve(jsonResponse({ draftId: "draft-1", uploadToken: "upload-token" }));
      }
      if (url === "/api/admin/imports/files") {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        return new Promise<Response>((resolve) => {
          pending.push(() => {
            active -= 1;
            resolve(jsonResponse({ receipt: `receipt-${pending.length}` }));
          });
        });
      }
      if (url === "/api/admin/imports/finalize") {
        return Promise.resolve(jsonResponse({
          draftToken: "draft-token",
          previewUrl,
          previewNonce,
          previewSetupToken
        }));
      }
      if (url === previewSetupUrl) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun(makeArchive("five-files.zip", {
      "index.html": strToU8("<html></html>"),
      "a.js": strToU8("a"),
      "b.js": strToU8("b"),
      "c.js": strToU8("c"),
      "d.js": strToU8("d")
    }));
    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));

    await waitFor(() => expect(pending).toHaveLength(3));
    expect(maximumActive).toBe(3);
    expect(
      screen
        .getAllByRole("status")
        .find((status) => status.textContent === "0 sur 5"),
    ).toBeDefined();
    pending[0]();
    await waitFor(() => expect(pending).toHaveLength(4));
    expect(maximumActive).toBe(3);
    pending.slice(1).forEach((resolve) => resolve());
    await waitFor(() => expect(pending).toHaveLength(5));
    pending[4]();

    expect(await screen.findByTitle("Prévisualisation du run importé")).toBeInTheDocument();
    expect(maximumActive).toBe(3);
  });

  it("keeps successful receipts and retries only rejected files before finalizing", async () => {
    const uploadPaths: string[] = [];
    let rejected = false;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/admin/imports") {
        return jsonResponse({ draftId: "draft-1", uploadToken: "upload-token" });
      }
      if (url === "/api/admin/imports/files") {
        const path = decodeURIComponent(new Headers(init?.headers).get("x-import-path") ?? "");
        uploadPaths.push(path);
        if (path === "broken.js" && !rejected) {
          rejected = true;
          return jsonResponse({ error: "Fichier invalide" }, 400);
        }
        return jsonResponse({ receipt: `receipt-${path}` });
      }
      if (url === "/api/admin/imports/finalize") {
        return jsonResponse({
          draftToken: "draft-token",
          previewUrl,
          previewNonce,
          previewSetupToken
        });
      }
      if (url === previewSetupUrl) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun(makeArchive("partial.zip", {
      "index.html": strToU8("<html></html>"),
      "broken.js": strToU8("broken")
    }));
    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));

    expect(await screen.findByText(/1 fichier n’a pas été accepté/i)).toBeInTheDocument();
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/admin/imports/finalize")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer le fichier en échec" }));

    expect(await screen.findByTitle("Prévisualisation du run importé")).toBeInTheDocument();
    expect(uploadPaths.filter((path) => path === "index.html")).toHaveLength(1);
    expect(uploadPaths.filter((path) => path === "broken.js")).toHaveLength(2);
    const finalizeCall = fetcher.mock.calls.find(([url]) => url === "/api/admin/imports/finalize");
    expect(JSON.parse(String(finalizeCall?.[1]?.body)).receipts).toEqual([
      "receipt-index.html",
      "receipt-broken.js"
    ]);
  });

  it("preserves metadata after archive or preview errors and never publishes an unloaded preview", async () => {
    vi.stubGlobal("fetch", successfulFetch());
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "gmail-clone" } });
    fireEvent.change(screen.getByLabelText("Modèle"), { target: { value: "model-a" } });
    fireEvent.change(screen.getByLabelText("Notes (facultatif)"), { target: { value: "À conserver" } });
    fireEvent.change(screen.getByLabelText("Archive LM Arena"), {
      target: { files: [new File([strToU8("not a zip")], "broken.zip", { type: "application/zip" })] }
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/archive/i);
    expect(screen.getByLabelText("Task")).toHaveValue("gmail-clone");
    expect(screen.getByLabelText("Modèle")).toHaveValue("model-a");
    expect(screen.getByLabelText("Notes (facultatif)")).toHaveValue("À conserver");

    fireEvent.change(screen.getByLabelText("Archive LM Arena"), { target: { files: [makeArchive()] } });
    expect(await screen.findByText("Archive valide")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));
    const preview = await screen.findByTitle("Prévisualisation du run importé");
    fireEvent.error(preview);

    expect(await screen.findByText(/prévisualisation n’a pas pu être chargée/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publier le run" })).toBeDisabled();
  });

  it.each([404, 500])("keeps publish unavailable when preview preflight returns %s", async (status) => {
    vi.stubGlobal("fetch", successfulFetch({ previewStatus: status }));
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun();
    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));

    expect(await screen.findByText(/prévisualisation sécurisée est indisponible/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Prévisualisation du run importé")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publier le run" })).toBeDisabled();
  });

  it("keeps publish unavailable after an authenticated runtime failure even if a late ready arrives", async () => {
    vi.stubGlobal("fetch", successfulFetch());
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun();
    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));
    const preview = await screen.findByTitle("Prévisualisation du run importé") as HTMLIFrameElement;
    fireEvent.load(preview);
    postPreviewMessage(preview, "error");
    postPreviewMessage(preview, "ready");

    expect(await screen.findByText(/prévisualisation n’a pas pu être chargée/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publier le run" })).toBeDisabled();
  });

  it("invalidates a ready preview on reload and requires readiness from the new document", async () => {
    vi.stubGlobal("fetch", successfulFetch());
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun();
    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));
    const preview = await screen.findByTitle("Prévisualisation du run importé") as HTMLIFrameElement;

    postPreviewMessage(preview, "ready", previewNonce, preview.contentWindow, 1);
    expect(screen.getByRole("button", { name: "Publier le run" })).toBeDisabled();
    fireEvent.load(preview);
    expect(screen.getByRole("button", { name: "Publier le run" })).toBeDisabled();
    postPreviewMessage(preview, "ready", previewNonce, preview.contentWindow, 1);
    expect(screen.getByRole("button", { name: "Publier le run" })).toBeEnabled();

    fireEvent.load(preview);
    expect(screen.getByRole("button", { name: "Publier le run" })).toBeDisabled();
    postPreviewMessage(preview, "ready", previewNonce, preview.contentWindow, 1);
    expect(screen.getByRole("button", { name: "Publier le run" })).toBeDisabled();
    postPreviewMessage(preview, "ready", previewNonce, preview.contentWindow, 2);
    expect(screen.getByRole("button", { name: "Publier le run" })).toBeEnabled();
  });

  it("retains the same draft token when publication fails and succeeds on retry", async () => {
    const fetcher = successfulFetch({ publishFailures: 1 });
    vi.stubGlobal("fetch", fetcher);
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun();
    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));
    const preview = await screen.findByTitle("Prévisualisation du run importé");
    markPreviewReady(preview as HTMLIFrameElement);
    fireEvent.click(screen.getByRole("button", { name: "Publier le run" }));

    expect(await screen.findByText(/le brouillon reste disponible/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer la publication" }));
    expect(await screen.findByRole("link", { name: "Voir le run public" })).toBeInTheDocument();

    const publishCalls = fetcher.mock.calls.filter(([url]) => url === "/api/admin/imports/draft-1/publish");
    expect(publishCalls).toHaveLength(2);
    expect(publishCalls.map(([, init]) => JSON.parse(String(init?.body)).draftToken)).toEqual([
      "draft-token",
      "draft-token"
    ]);
  });

  it("cancels a finalized draft and clears its local preview state", async () => {
    const fetcher = successfulFetch();
    vi.stubGlobal("fetch", fetcher);
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun();
    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));
    await screen.findByTitle("Prévisualisation du run importé");
    fireEvent.click(screen.getByRole("button", { name: "Annuler le brouillon" }));

    expect(await screen.findByText("Brouillon annulé.")).toBeInTheDocument();
    expect(screen.getByLabelText("Archive LM Arena")).toBeInTheDocument();
    const cancelCall = fetcher.mock.calls.find(([url, init]) => (
      url === "/api/admin/imports/draft-1" && init?.method === "DELETE"
    ));
    expect(JSON.parse(String(cancelCall?.[1]?.body))).toEqual({ draftToken: "draft-token" });
  });

  it("clears sensitive archive state when the server reports an expired session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Accès refusé" }, 401)));
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun();
    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Votre session a expiré");
    expect(screen.queryByText("Archive valide")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Se reconnecter" })).toHaveAttribute("href", "/admin/import");
  });

  it("clears sensitive local state before sending the logout request", async () => {
    let resolveLogout: ((response: Response) => void) | undefined;
    let archiveWasClearedBeforeDelete = false;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/admin/session" && init?.method === "DELETE") {
        archiveWasClearedBeforeDelete = screen.queryByText("Archive valide") === null;
        return new Promise<Response>((resolve) => {
          resolveLogout = resolve;
        });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun();
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalled());

    expect(archiveWasClearedBeforeDelete).toBe(true);
    resolveLogout?.(new Response(null, { status: 204 }));
    expect(await screen.findByText("Session fermée.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Se reconnecter" })).toHaveAttribute("href", "/admin/import");
  });

  it("ignores a late begin response after logout instead of resuming uploads", async () => {
    let resolveBegin: ((response: Response) => void) | undefined;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/admin/imports") {
        return new Promise<Response>((resolve) => {
          resolveBegin = resolve;
        });
      }
      if (url === "/api/admin/session" && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      throw new Error(`Unexpected request after logout: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun();
    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/imports",
      expect.objectContaining({ method: "POST" })
    ));
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    await screen.findByText("Session fermée.");
    resolveBegin?.(jsonResponse({ draftId: "draft-1", uploadToken: "upload-token" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetcher.mock.calls.filter(([url]) => url === "/api/admin/imports/files")).toHaveLength(0);
    expect(screen.queryByTitle("Prévisualisation du run importé")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive valide")).not.toBeInTheDocument();
  });

  it("ignores a late publish success after logout and stays expired", async () => {
    let resolvePublish: ((response: Response) => void) | undefined;
    const base = successfulFetch();
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/admin/imports/draft-1/publish") {
        return new Promise<Response>((resolve) => {
          resolvePublish = resolve;
        });
      }
      if (url === "/api/admin/session" && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return base(input, init);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun();
    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));
    const preview = await screen.findByTitle("Prévisualisation du run importé");
    markPreviewReady(preview as HTMLIFrameElement);
    fireEvent.click(screen.getByRole("button", { name: "Publier le run" }));
    await waitFor(() => expect(resolvePublish).toBeTypeOf("function"));
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    await screen.findByText("Session fermée.");

    resolvePublish?.(jsonResponse({
      run: { id: "melvynx-run-1", task: "gmail-clone" },
      runUrl: "/runs/melvynx-run-1",
      taskUrl: "/tasks/gmail-clone",
      cleanupWarning: null,
      invalidationWarning: null
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByRole("link", { name: "Se reconnecter" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Voir le run public" })).not.toBeInTheDocument();
  });

  it("ignores a late cancellation success after logout and stays expired", async () => {
    let resolveCancel: ((response: Response) => void) | undefined;
    const base = successfulFetch();
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/admin/imports/draft-1" && init?.method === "DELETE") {
        return new Promise<Response>((resolve) => {
          resolveCancel = resolve;
        });
      }
      if (url === "/api/admin/session" && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return base(input, init);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AdminImportWizard csrf={csrf} tasks={tasks} />);

    await identifyRun();
    fireEvent.click(screen.getByRole("button", { name: "Créer la prévisualisation" }));
    await screen.findByTitle("Prévisualisation du run importé");
    fireEvent.click(screen.getByRole("button", { name: "Annuler le brouillon" }));
    await waitFor(() => expect(resolveCancel).toBeTypeOf("function"));
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    await screen.findByText("Session fermée.");

    resolveCancel?.(jsonResponse({ cancelled: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByRole("link", { name: "Se reconnecter" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Archive LM Arena")).not.toBeInTheDocument();
    expect(screen.queryByText("Brouillon annulé.")).not.toBeInTheDocument();
  });
});
