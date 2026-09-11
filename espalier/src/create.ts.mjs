export const description = "the create command";

export const rule = `Creates only absent files declared by structural rules,
using an exported template when present and an empty file otherwise. Never
overwrites source.`;

export async function lint() {}
