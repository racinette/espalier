# Deep excluded adoption is refused

`init --ignore-all` writes a broad `tests/**` exclusion. Adopting a directory
several levels below it must fail without changing the exclusion or writing
modules. Repository policy must explicitly re-include the target first.
