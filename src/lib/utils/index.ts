export const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

export const getAssetData = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
};

export const getFontBlobUrl = async (url: string): Promise<string> => {
  const data = await getAssetData(url);
  const blob = new Blob([new Uint8Array(data)], { type: 'font/woff2' });
  return URL.createObjectURL(blob);
};

export const triggerDownload = (url: string, name: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
};
