# Espalier 0.2.1

This patch release adds `espalier --version`. It prints the version of the
installed CLI on one line and works without a repository configuration.

There are no changes to rule behavior or the configuration schema. Projects
upgrading from 0.2.0 can install 0.2.1, run `espalier migrate` to update their
exact `pin`, then run `espalier lint` and `espalier build --check`.
