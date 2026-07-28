// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportPreview } from "../../src/components/import-preview";
import { adminPreviewMessageType } from "../../src/lib/visuals/preview";

const nonce = "cd".repeat(16);
const metadata = {
  task: "gmail-clone",
  model: "model-a",
  harness: "lmarena" as const,
  createdAt: "2026-07-26T12:00:00.000Z",
  notes: ""
};

function postFrom(iframe: HTMLIFrameElement, data: unknown, source: MessageEventSource | null = iframe.contentWindow) {
  window.dispatchEvent(new MessageEvent("message", { data, source }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ImportPreview", () => {
  it("requires iframe load plus an exact ready message from its own frame and signed nonce", () => {
    const onError = vi.fn();
    const onFrameLoad = vi.fn();
    const onReady = vi.fn();
    render(
      <ImportPreview
        error={false}
        loaded={false}
        metadata={metadata}
        nonce={nonce}
        onError={onError}
        onFrameLoad={onFrameLoad}
        onReady={onReady}
        previewUrl="/api/admin/imports/draft-1/visual?preview=short-token"
      />
    );

    const iframe = screen.getByTitle("Prévisualisation du run importé") as HTMLIFrameElement;
    fireEvent.load(iframe);
    expect(onFrameLoad).toHaveBeenCalledOnce();
    expect(onReady).not.toHaveBeenCalled();

    postFrom(iframe, { type: adminPreviewMessageType, state: "ready", nonce }, window);
    postFrom(iframe, { type: adminPreviewMessageType, state: "ready", nonce: "ef".repeat(16) });
    postFrom(iframe, { type: adminPreviewMessageType, state: "ready", nonce, extra: true });
    expect(onReady).not.toHaveBeenCalled();

    postFrom(iframe, { type: adminPreviewMessageType, state: "ready", nonce });
    expect(onReady).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports authenticated runtime failures and removes its message listener on unmount", () => {
    const onError = vi.fn();
    const view = render(
      <ImportPreview
        error={false}
        loaded={false}
        metadata={metadata}
        nonce={nonce}
        onError={onError}
        onFrameLoad={vi.fn()}
        onReady={vi.fn()}
        previewUrl="/api/admin/imports/draft-1/visual?preview=short-token"
      />
    );
    const iframe = screen.getByTitle("Prévisualisation du run importé") as HTMLIFrameElement;

    postFrom(iframe, { type: adminPreviewMessageType, state: "error", nonce });
    expect(onError).toHaveBeenCalledOnce();

    view.unmount();
    postFrom(iframe, { type: adminPreviewMessageType, state: "error", nonce });
    expect(onError).toHaveBeenCalledOnce();
  });
});
