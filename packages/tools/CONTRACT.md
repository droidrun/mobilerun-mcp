# Tool contract & versioning rules

`@mobilerun/mcp-tools`' public contract is its tool surface: tool names,
input schema shapes, and output shapes (the JSON each tool's `content[0].text`
deserializes to). `src/__tests__/schema-snapshot.test.ts` pins the names +
input schemas of the full-access tool surface (`fullAccessPolicy()`) so a
drift shows up as a diff in review, not silently downstream.

## SemVer rules

- **Major** (breaking):
  - Renaming or removing a tool.
  - Removing or renaming an input/output field.
  - Narrowing an input field's type (e.g. widening a required set, dropping
    an enum value that was previously valid input).
  - Making a previously-optional input field required.
  - Changing a field's semantic meaning without changing its name/type.
- **Minor** (additive, backward-compatible):
  - Adding a new tool.
  - Adding a new optional input field.
  - Adding a new enum value to an existing field (input or output).
  - Adding a new optional/additional field to a DTO's output shape.
  - Widening a required input field to optional.
- **Patch** (no shape change):
  - Description-only changes (tool description, field `.describe()` text).
  - Internal refactors with no observable schema/behavior change.

When a change spans categories, it's classified by its most severe bucket
(one major field change makes the whole release major, even alongside minor
additions).

## Deprecation policy

A tool or field is never removed in the same release it's deprecated:

1. Mark it deprecated — append a `Deprecated: <reason>. Use <replacement>
   instead.` sentence to its description (and, where practical, to the
   specific field's `.describe()`).
2. Ship at least one **minor** release with the deprecation notice live
   before the removal ships.
3. The removal itself is a **major** release, per the rules above.

## Bundle tools (`operation`/`resource` enums)

For bundle tools (`webhooks`, `list_workflow_resources`,
`get_workflow_resource`), each `operation`/`resource` enum value is treated
like its own semver surface:

- Adding a new value: minor.
- Removing/renaming a value the model could have been relying on: major,
  and subject to the deprecation policy above.

`Policy.operationAllowlist` (see `src/ctx.ts`) narrows which of a bundle
tool's enum values a given credential may use, at runtime — it is a
deployment/credential-scoping concern, not a contract change; the input
schema's enum always advertises the tool's full built-in surface (see the
comment in `src/tools/webhooks.ts` / `src/tools/workflows.ts` for why the
schema itself isn't narrowed per-policy).

## Ports vs. DTOs (`src/backend/*.ts`)

The `Backend` ports (`DevicesBackend`, `WorkflowsBackend`, `WebhooksBackend`,
`CredentialsBackend`) and their DTOs are a **semantic tool-capability
contract**, not a mirror of `@mobilerun/sdk`'s full response types. A DTO
carries only the fields the tools actually surface to the model. Extending
a DTO with a new optional field to surface more of the underlying API is a
minor change under the same rules as above; removing/renarrowing a DTO
field a tool already serializes is major.

## Updating the snapshot

When a change is intentional, regenerate the snapshot and review the diff
like any other contract change:

```bash
bun test packages/tools/src/__tests__/schema-snapshot.test.ts --update-snapshots
```
