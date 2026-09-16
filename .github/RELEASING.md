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

## First publication

The package must exist on npm before its
[trusted publisher](https://docs.npmjs.com/cli/v11/commands/npm-trust/#prerequisites)
can be configured. Register it with a separate placeholder `0.0.0`, then
publish the real `0.1.0` through GitHub Actions, as `tolk-inspect` does.

1. Push the reviewed release preparation and wait for CI to pass:

   ```bash
   git push origin main
   ```

2. Create the GitHub repository environment named exactly `npm`. Leave its
   secrets empty. Required reviewers are optional.
3. Confirm that the unscoped name `espalier` is available to your npm account
   and enable account 2FA. Log in locally, then publish a placeholder from a
   temporary directory. These commands do not change the repository:

   ```bash
   npm login --registry=https://registry.npmjs.org/
   npm whoami

   (
     set -e
     espalier_bootstrap_dir="$(mktemp -d)"
     cd "$espalier_bootstrap_dir" || exit
     npm init --yes
     npm pkg set \
       name=espalier \
       version=0.0.0 \
       type=module \
       license=MIT \
       description='Bootstrap record for espalier trusted publishing'
     npm pkg set \
       repository.type=git \
       repository.url=git+https://github.com/racinette/espalier.git
     npm pkg delete main scripts
     npm pack --dry-run
     npm publish --registry=https://registry.npmjs.org/ --access public --tag bootstrap
   )

   npm view espalier name version dist-tags repository.url --json
   ```

   Complete npm's interactive 2FA confirmation for publication. The
   placeholder contains no library implementation; the repository version
   remains `0.1.0`.
4. In npm's `espalier` package settings, add a GitHub Actions trusted publisher
   with these exact fields:

   | Field | Value |
   | --- | --- |
   | Organization or user | `racinette` |
   | Repository | `espalier` |
   | Workflow filename | `release.yml` |
   | Environment name | `npm` |
   | Allowed actions | Enable direct `npm publish` |

   Alternatively, configure and verify it from the CLI:

   ```bash
   npx --yes npm@11.19.1 trust github espalier \
     --file release.yml \
     --repo racinette/espalier \
     --env npm \
     --allow-publish
   npx --yes npm@11.19.1 trust list espalier
   ```

   See [npm's trusted publishing setup](https://docs.npmjs.com/trusted-publishers/).
5. Once the connection is configured, set npm Publishing access to
   **Require two-factor authentication and disallow tokens**. OIDC publishing
   continues to work with that setting.
6. Create the real release as a draft targeting the reviewed commit:

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
7. After the workflow succeeds, verify the real release and retire the
   bootstrap marker:

   ```bash
   npm view espalier version dist-tags --json
   npm deprecate espalier@0.0.0 'Bootstrap-only release; install the latest version.'
   npm dist-tag rm espalier bootstrap
   ```

   The real release moves `latest` to `0.1.0`. Publish the GitHub release only
   after the placeholder exists and trusted publishing is configured.

## Subsequent releases

Update `package.json`, both root version fields in `package-lock.json`, the
repository's `espalier.config.yaml` pin, and the package pins in documentation,
tests, and fixtures together. The configuration schema's `version: 1` stays
unchanged. Espalier requires an exact package version match, so changing only
the manifest leaves the repository and fixtures unable to run.

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
