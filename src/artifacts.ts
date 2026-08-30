export interface GeneratedArtifact {
  target: string;
  path: string;
  contents: string;
}

export interface ArtifactTarget {
  id: string;
  owns(path: string): boolean;
  artifacts: GeneratedArtifact[];
}

export function mergeArtifacts(
  targets: ArtifactTarget[],
): Map<string, GeneratedArtifact> {
  const merged = new Map<string, GeneratedArtifact>();

  for (const target of targets) {
    for (const artifact of target.artifacts) {
      if (artifact.target !== target.id) {
        throw new Error(
          `artifact target "${artifact.target}" does not match "${target.id}"`,
        );
      }

      const existing = merged.get(artifact.path);
      if (existing !== undefined) {
        throw new Error(
          `generated artifact collision at ${artifact.path}: ${existing.target} and ${target.id}`,
        );
      }

      merged.set(artifact.path, artifact);
    }
  }

  return merged;
}
