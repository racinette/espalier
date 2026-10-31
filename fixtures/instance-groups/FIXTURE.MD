# Groups declared and tightened in named instances

Pins INSTANCES.MD "In a named instance" and "Adding to an inherited grouping".
Every feature's `steps/` follows one contract, grouped into steps by number,
and the contract declares step `0009` for every feature. Two features are
named instances.

`orders` declares its own step `0002`. It holds only orders' files, so it is
required in orders and nowhere else: orders has no `0002` yet and is reported
as `missing_required_group`, while `billing` and `checkout` are not. It is
stated in orders' own document, not beside the contract.

`checkout` restates the rule to make the inherited `step` grouping abstract
and add guidance, and declares its step `0001`. Its undeclared `0002` is
reported as `undeclared_instance`; its `0009` counts as declared through the
contract's declaration; `orders` and `billing` are not abstract. `explain`
shows one `step` grouping with both guidances.

Afterwards checkout declares `0002` and orders adds its step, so the
repository conforms.
