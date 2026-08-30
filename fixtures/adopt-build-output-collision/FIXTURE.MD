# Adopt refuses build-owned documentation

An existing hand-written file with the configured output name cannot become a
structural rule: a later build would overwrite it. Adoption must stop before
writing anything and point the user at the durable `ESPALIER.MD` source.
