# Masks, lists and ownership

Pins MATCHING.MD "Masks" and the mask example under "Ambiguity is rejected".
A migrations directory keeps three sibling rules for one filename shape: six
padded digits and a lowercase slug, any digit run, and any stem at all. The
narrowest mask owns each file, and captures are reported by the rules that
receive them. A list capture owns exactly the names it lists and leaves the
rest to a bare placeholder. A dated note is one capture holding its separators;
a note without a date has no owner, because a mask that does not match does
not match.

Also pins that generated guidance renders masked and listed placeholders as
authored, and lists narrower masks before their fallbacks.
