# Deep adoption preserves every unadopted branch

`init --ignore-all` writes a broad `tests/**` exclusion. Adopting a directory
several levels below it must replace that exclusion with exclusions for every
sibling branch encountered on the way down, not only siblings at `tests/`.
