# Browser acceptance runtime ownership (#217)

Parent: #125. Independent acceptance baseline: default `62e2462`.
Shared convention source: `46d8793bb3034326561f876dcc67dbaa5aa1e432`.

## Authority and scope

Atlas 1.1.1, 1.2.1 and 1.4.1 require real Pages play, readable phone crops and a compact scene-first HUD. ADR 0007 distinguishes browser-local WASM persistence from the normal server runtime; ADR 0022 preserves shared Rust gameplay authority. The owner-approved #217 repair changes verification ownership, not gameplay or the full #125 visual acceptance.

`wheat-art.spec.ts` creates a crop through real Rust WASM commands and resident work, writes its browser-local save, and adjusts fixture growth timestamps. `api.ts` loads that save only for `VITE_MY_FARM_RUNTIME=wasm_demo`. The server configuration currently discovers this fixture despite using the HTTP/WebSocket runtime. Page clock or localStorage changes cannot seed or advance that server Farm.

## Executable discovery contract

Run `node scripts/check-browser-runtime-ownership.mjs`. It invokes actual Playwright JSON discovery for both existing configurations; it does not reproduce their testMatch rules. Both named Wheat cases must remain required Pages tests with no skip/fixme, and the server configuration must not dispatch the browser-local fixture. The real server shell remains required for both desktop and mobile.

At baseline the Pages checks pass, then the ownership assertion fails: the server discovers four Wheat entries (two named cases in each desktop/mobile project). Discovery is not gameplay execution; its JSON list results carry no completed browser evidence.

## Retained behavioral contracts

The existing Wheat test must still verify pinned actual resources, early/mature/ready presentation at desktop and phone widths, matching icon, accepted Harvest while the crop is still ready, real Rust queue completion, increased Silo Wheat, empty plot and reload. Keep those assertions and actual command/deposit checks. Its authored timestamp inputs and offline Rust queue advancement remain fixture techniques, not proof of real elapsed production or server parity.

The server shell keeps its menu, level, actual Plant/Build controls, Structure interaction and visible canvas with width/height greater than 250. Desktop keeps visible branding. Mobile instead requires the existing compact Farm actions and an actual visible Field Plot, matching intentional responsive branding suppression. Do not add skips, API mocks, fabricated outcomes or new browser infrastructure to repair these cases.

Existing Wheat `force: true` clicks require an independent actual-browser actionability diagnostic before any translation. A translated click must target the real exposed plot through ordinary Playwright input and preserve Selection, icon and accepted Harvest assertions. No force, event dispatch or synthetic result is an acceptable substitute. This diagnostic is pending at this acceptance commit; no Wheat fixture change is authorized by this document alone.

## Completion evidence

A distinct harness producer may implement discovery and the approved mobile expectation translation after this independent handoff. Before merge run this discovery contract, the complete documented server suite and complete Pages suite on the final head. Require actual Wheat and mobile shell passes; report every existing skip and any new failure honestly. Baseline server evidence is 180 passed, 41 existing skipped and three failures (two mismatched Wheat runtimes and hidden phone branding); that evidence precedes this repair and is not a new execution at this commit. Browser fixture coverage does not establish native parity, fresh public deployment or full #125 completion.
