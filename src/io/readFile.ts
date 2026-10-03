// Files are read into memory only, with Blob.arrayBuffer(). Nothing is
// uploaded or stored; the bytes are gone when the tab closes.

export interface LoadedFile {
  name: string;
  size: number;
  bytes: ArrayBuffer;
}

export async function readFiles(list: FileList | File[]): Promise<LoadedFile[]> {
  const files = Array.from(list);
  return Promise.all(
    files.map(async (f) => ({ name: f.name, size: f.size, bytes: await f.arrayBuffer() })),
  );
}
