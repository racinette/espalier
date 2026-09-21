# Publishing Espalier

Publishing a non-prerelease GitHub release with a stable version tag such as
`v0.1.0` runs [`release.yml`](workflows/release.yml). The tag must match
`package.json`. This follows the publishing setup used by `tolk-inspect`,
including npm CLI `11.6.2` and the GitHub environment `npm`.

Tests, architecture lint, and generated guidance checks must pass on Node 24
and 26 before publishing. The package's `prepublishOnly` script also cleans
and rebuilds `dist/` and runs the tests immediately before publication.
Releases are public and use npm's `latest` tag. Trusted publishing supplies
provenance automatically for a public repository and package. The workflow
requires no `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret. Prerelease tags are
rejected by this workflow.

## First implementation release

The owner has already registered `espalier@0.0.0` on npm. The package therefore
exists and its trusted publisher can be configured immediately. Publish the
real implementation as `0.1.0` through GitHub Actions.

1. Push the reviewed release preparation and wait for CI to pass:

   ```bash
   git push origin main
   ```

2. Create the GitHub repository environment named exactly `npm`. Leave its
   secrets empty. Required reviewers are optional.
3. Enable npm account 2FA. In the existing `espalier` package settings, add a
   GitHub Actions trusted publisher with these exact fields:

   | Field | Value |
   | --- | --- |
   | Organization or user | `racinette` |
   | Repository | `espalier` |
   | Workflow filename | `release.yml` |
   | Environment name | `npm` |
   | Allowed actions | Enable direct `npm publish` |

   Alternatively, configure and verify it from the CLI:

   ```bash
   npm login --registry=https://registry.npmjs.org/
   npx --yes npm@11.19.1 trust github espalier \
     --file release.yml \
     --repo racinette/espalier \
     --env npm \
     --allow-publish
   npx --yes npm@11.19.1 trust list espalier
   ```

   If already configured, run only the `trust list` command to verify it.
   See [npm's trusted publishing setup](https://docs.npmjs.com/trusted-publishers/).
4. Once the connection is configured, set npm Publishing access to
   **Require two-factor authentication and disallow tokens**. OIDC publishing
   continues to work with that setting.
5. Create the real release as a draft targeting the reviewed commit:

   ```bash
   git tag -a v0.1.0 -m 'Release 0.1.0'
   git push origin v0.1.0
   gh release create v0.1.0 --verify-tag --title '0.1.0' --generate-notes --draft
   ```

   Review the draft, then publish it:

   ```bash
   gh release edit v0.1.0 --draft=false
   ```

   Publishing the GitHub release triggers validation and npm publication.
   Approve the `npm` environment deployment if you configured reviewers.
6. Find and monitor the release workflow:

   ```bash
   gh run list --workflow release.yml --limit 1
   gh run watch RUN_ID --exit-status
   ```

   Replace `RUN_ID` with the run ID displayed by the first command.
7. After the workflow succeeds, verify the real release:

   ```bash
   npm view espalier version dist-tags --json
   ```

   Expect version `0.1.0` and `latest: 0.1.0`. Optionally deprecate the
   reservation release:

   ```bash
   npm deprecate espalier@0.0.0 'Reservation-only release; install the latest version.'
   ```

   Configure trusted publishing before publishing the GitHub release.

## Subsequent releases

Update `package.json`, both root version fields in `package-lock.json`, the
repository's `espalier.config.yaml` pin, and the package pins in documentation,
tests, and fixtures together. There is no separate configuration schema
version; `pin` is the only version. Espalier requires an exact package version
match, so changing only the manifest leaves the repository and fixtures unable
to run until they are migrated or edited.

Run the checks before committing:

```bash
npm test
node dist/src/cli.js lint --no-cache
node dist/src/cli.js build
node dist/src/cli.js build --check
```

Commit and push the reviewed changes, then create and push the matching
annotated tag and publish its GitHub release. Ordinary branch pushes, tag
pushes, and pull requests do not publish to npm. If publication fails before
uploading, fix the account setup and rerun the failed workflow. After a
successful publication, any change requires
a new version; do not move an existing release tag.
