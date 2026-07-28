declare module "jsdom" {
  type TestWindow = Window & typeof globalThis & {
    close(): void;
  };

  export class JSDOM {
    constructor(html?: string, options?: {
      beforeParse?: (window: TestWindow) => void;
      runScripts?: "dangerously" | "outside-only";
      url?: string;
    });

    readonly window: TestWindow;
  }
}
