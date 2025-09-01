export type FileData = {
  fileName: string;
  fileData: string; // base64
  mimeType: string;
  thumbData?: string;
  lastModified?: number;
};
