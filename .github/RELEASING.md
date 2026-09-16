# Publishing Espalier

Publishing a non-prerelease GitHub release with a stable version tag such as
`v0.1.0` runs [`release.yml`](workflows/release.yml). The tag must match
`package.json`. This follows the publishing setup used by `tolk-inspect`,
including npm CLI `11.6.2` and the GitHub environment `npm`.

Tests, architecture lint, and generated guidance checks must pass on Node 24
and 26 before publishing. The package's `prepublishOnly` script also cleans
and rebuilds `dist/` and runs the tests immediately before publication.
Releases are public and use npm's `latest` tag, with provenance from GitHub
Actions. Prerelease tags are rejected by this workflow.

## First publication

The package must exist on npm before its
[trusted publisher](https://docs.npmjs.com/cli/v11/commands/npm-trust/#prerequisites)
can be configured. For the first release:

1. Confirm that the unscoped name `espalier` is available to your npm account.
2. Create the GitHub repository environment `npm`. Create a short-lived npm
   granular access token with permission to create and publish the package,
   and with **Bypass 2FA** enabled. Add it as the
   GitHub environment secret `NPM_TOKEN` in `npm`. See
   [npm's publishing authentication requirements](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/).
3. Push the reviewed release commit and tag, then publish its GitHub release:

   ```bash
   git push origin HEAD
   git tag -a v0.1.0 -m 'Release 0.1.0'
   git push origin v0.1.0
   gh release create v0.1.0 --verify-tag --title '0.1.0' --generate-notes
   ```

4. After publication, open the `espalier` package settings on npm and add a
   GitHub Actions trusted publisher with these exact fields:

   | Field | Value |
   | --- | --- |
   | Organization or user | `racinette` |
   | Repository | `espalier` |
   | Workflow filename | `release.yml` |
   | Environment name | `npm` |
   | Allowed actions | Enable direct `npm publish` |

5. Remove the GitHub environment's `NPM_TOKEN` secret and revoke the temporary
   npm token. Later releases authenticate through OIDC. See
   [npm's trusted publishing setup](https://docs.npmjs.com/trusted-publishers/).

The first release can alternatively be published locally with `npm login`
and `npm publish --access public`, after running the checks below. Then
configure trusted publishing before using the workflow for the next release.
Do not publish a GitHub release for the same version afterward: npm cannot
republish an existing name and version. Ensure the GitHub `npm` environment
exists before the first workflow release.

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
