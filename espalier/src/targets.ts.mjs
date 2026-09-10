export const description = "constraint target selection";

export const rule = `Derive narrowed target patterns from the compiled constraint and
apply them identically in lint and explain. Target selection filters candidates; it
does not change structural ownership.`;

export async function lint() {}
