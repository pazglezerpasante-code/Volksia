import test from "node:test";
import assert from "node:assert/strict";
import { appNameFromHost, renderWebManifest, renderInstallPageHtml } from "./grok-pwa-shared.mjs";

test("SURI has a fixed name on all domains", () => {
  for (const host of ["localhost:3000", "volksia.vercel.app", "suri.vercel.app", "unknown.grok.me"]) {
    assert.equal(appNameFromHost(host), "SURI");
    const manifest = JSON.parse(renderWebManifest(host));
    assert.equal(manifest.name, "SURI");
    assert.equal(manifest.short_name, "SURI");
    assert.equal(manifest.display, "standalone");
  }
});

test("install tutorial receives SURI brand", () => {
  assert.match(renderInstallPageHtml("<title>{{APP_NAME}}</title>", {host:"volksia.vercel.app",url:"/"}), /<title>SURI<\/title>/);
});
