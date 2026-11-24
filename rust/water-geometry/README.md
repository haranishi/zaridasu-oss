# Water geometry accelerator

This dependency-free Rust crate calculates nearby water bounds, closest shore,
distance and public record counts. The browser runs the compiled module in a
worker after water search starts. Small workloads and accelerator failures use
the existing JavaScript implementation.

## Build and verification

Normal application builds need only Node.js: the hashed Wasm asset is committed.
`npm run build` verifies that its source hash, binary hash and URL agree.
The build recipe is also hashed. Project and Rust sysroot paths are remapped
to avoid embedding a developer's machine paths in the distributed module.
Standard-library macro paths use the compiler's `/rustc/<revision>` prefix,
matching precompiled standard-library paths on both macOS and Linux.

To change Rust code, use the same toolchain as CI:

```sh
rustup toolchain install 1.99.0 --profile minimal --component rustfmt,clippy --target wasm32-unknown-unknown
export RUSTUP_TOOLCHAIN=1.99.0
npm run wasm:build
cargo fmt --manifest-path rust/water-geometry/Cargo.toml --check
cargo clippy --manifest-path rust/water-geometry/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path rust/water-geometry/Cargo.toml --locked
npm run wasm:check
npm test -- src/features/water/lib/__tests__/waterGeometry.test.ts
npm run bench:water
```

Commit the changed sources, `artifact.json`, generated `waterGeometryAsset.ts`
and new `public/wasm/water-geometry.<hash>.wasm` together. Keep old assets if they
may still be referenced by open browser sessions.

## Runtime contract

- ABI version 1 uses checked Float64 packets and module-owned buffers.
- Input limits: 512 candidates, 1,000 public points, 1,000,000 numeric values.
- Polygon holes, MultiPolygon areas and community point candidates are supported.
- A missing module, unsupported worker, invalid packet or timeout falls back.
- Cancellation prevents completed calculations from updating an obsolete search.
- Only public display coordinates are passed to the worker.

The benchmark includes serialization and result construction. It excludes
network latency, worker dispatch and map rendering; its synthetic results
describe calculation speed, not whole-page loading time.

Build flag reference: [rustc path remapping](https://doc.rust-lang.org/rustc/command-line-arguments.html#--remap-path-prefix-remap-source-paths-in-output).
