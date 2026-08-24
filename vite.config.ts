import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": workerProxy(),
      "/media": workerProxy(),
    },
  },
});

function workerProxy(): ProxyOptions {
  const target = "http://localhost:8787";
  return {
    target,
    changeOrigin: true,
    configure(proxy) {
      // The Worker validates POST Origin against its own request URL. Rewrite the
      // browser dev-server origin while proxying so local requests remain same-origin.
      proxy.on("proxyReq", (proxyRequest) => {
        proxyRequest.setHeader("origin", target);
      });
    },
  };
}
