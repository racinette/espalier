# Abstract contracts

Pins INSTANCES.MD and TYPES.MD "abstract". Two contracts declare that every
match must be a declared instance: the `[route]/` directory of an app router
and the `[provider].ts` file of a clients directory. `about/` and `stripe.ts`
are declared, so they are ordinary instances. `blog/` and `adyen.ts` match
the contracts and are not declared, so each is reported once as
`undeclared_instance`, on the directory with a trailing slash and on the file,
naming the module to write. They are still owned, so nothing is
`unexpected_path`, and the contract's guidance still applies to them.

The map counts an abstract contract's members as "declared", and `explain`
marks an undeclared member.
