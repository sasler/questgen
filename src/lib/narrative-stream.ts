export interface BufferedNarrativeStream {
  pushChunk: (chunk: string) => void;
  flush: () => void;
}

export function createBufferedNarrativeStream(
  onNarrativeChunk?: (chunk: string) => void,
): BufferedNarrativeStream {
  const chunks: string[] = [];

  return {
    pushChunk(chunk: string) {
      if (!onNarrativeChunk) {
        return;
      }

      chunks.push(chunk);
    },
    flush() {
      if (!onNarrativeChunk) {
        return;
      }

      for (const chunk of chunks) {
        onNarrativeChunk(chunk);
      }
    },
  };
}
