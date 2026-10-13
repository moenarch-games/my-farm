# Browser Local WASM Pages Demo

> **Historical scope note (2026-10-12):** This ADR accurately describes the original deliberately restricted Pages demo. It no longer defines the *target* feature scope: [Decision Atlas 1.1.1](../decisions/atlas.md) approves incremental full eligible browser-local single-player parity; [roadmap #126](https://github.com/moritzbrantner/my-farm/issues/126) and [#153](https://github.com/moritzbrantner/my-farm/issues/153) track its implementation and acceptance. The limitations below remain true of the current implementation until the corresponding feature slices are shipped; Rust/WASM game authority and local browser saves still apply.

GitHub Pages publishes a static browser demo that runs the Rust core through WebAssembly instead of requiring the local Axum and SQLite server.

The normal development setup remains server-authoritative with SQLite persistence. The Pages demo is deliberately narrower: it shows the early crop and Farmhouse Oven bread production loop, stores progress in the visitor's browser, and hides later systems such as animals, market trading, delivery orders, storage upgrades, Tool Shed support structures, and the Farm Shop.

This keeps the public demo easy to open from GitHub Pages while preserving the server-backed architecture for the full prototype. The trade-off is that Pages saves are local to one browser and the demo is not expected to represent every game feature.
