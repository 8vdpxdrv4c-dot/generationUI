export interface SandboxInstance {
  iframe: HTMLIFrameElement;
  promise: Promise<unknown>;
  run: (code: string) => Promise<unknown>;
  destroy: () => void;
}

export interface WebsandboxModule {
  create: (
    localApi: Record<string, (args: unknown) => unknown>,
    options: {
      frameContainer: HTMLElement;
      frameContent: string;
      allowAdditionalAttributes: string;
    }
  ) => SandboxInstance;
}

type WebsandboxNamespace = {
  default?: WebsandboxModule & { default?: WebsandboxModule };
};

// websandbox ships a UMD bundle with its own webpack `default` export.
// Consumer bundlers wrap CJS under another `.default`, resulting in
// mod.default.default for the actual Websandbox class.
export async function loadWebsandbox(): Promise<WebsandboxModule> {
  const mod = (await import("@jetbrains/websandbox")) as WebsandboxNamespace;
  const Websandbox = (mod.default?.default ?? mod.default) as WebsandboxModule;
  return {
    create: (api, options) => {
      const sandbox = Websandbox.create(api, options);
      let destroyed = false;
      return {
        iframe: sandbox.iframe,
        promise: sandbox.promise,
        run: (code) => sandbox.run(code),
        destroy: () => {
          if (destroyed) return;
          destroyed = true;
          // Give the frame one bridge round trip to release WebGL contexts and
          // animations. Always remove it even if initialization never finished.
          let removed = false;
          const remove = () => { if (!removed) { removed = true; sandbox.destroy(); } };
          const timer = setTimeout(remove, 150);
          void sandbox.run("window.__oguiDispose?.();").catch(() => {}).finally(() => {
            clearTimeout(timer);
            remove();
          });
        },
      };
    },
  };
}
