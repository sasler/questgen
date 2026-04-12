export interface BufferedNarrativeStream {
  pushChunk: (chunk: string) => void;
  flush: () => void;
}

export function createBufferedNarrativeStream(
  onNarrativeChunk?: (chunk: string) => void,
): BufferedNarrativeStream {
  return {
    pushChunk(chunk: string) {
      if (!onNarrativeChunk) {
        return;
      }

      onNarrativeChunk(chunk);
    },
    flush() {
      // Chunks are forwarded immediately to preserve true streaming.
    },
  };
}
