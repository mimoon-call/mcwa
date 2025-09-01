import type { FileData } from '@models';

export default class FileService {
  public static joinBase64(base64Data?: string, mimeType?: string): string | undefined {
    const isAlreadyHaveMimeType = base64Data?.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);

    return !mimeType || !isAlreadyHaveMimeType ? base64Data : `data:${mimeType};base64,${base64Data}`;
  }

  public static async isFileExists(file: File): Promise<boolean> {
    return new Promise((resolve) => {
      fetch(URL.createObjectURL(file))
        .then(() => resolve(true))
        .catch(() => resolve(false));
    });
  }

  public static isValidBase64(data: string): boolean {
    try {
      return !!(/data:([^"]+)*/g.exec(data) || []).length;
    } catch (e) {
      console.error(e);

      return false;
    }
  }

  public static type(name: string): string | undefined {
    const ext = name?.split('.');

    return ext ? ext[ext.length - 1] : undefined;
  }

  public static async urlToBlob(url: string): Promise<Blob> {
    const urlData = await fetch(url);

    return await urlData.blob();
  }

  public static prefixBase64(dataBase64: string, type?: string): string {
    const data = dataBase64?.split(',')[1] || dataBase64;

    switch (type) {
      case 'jpg':
      case 'jpeg':
      case 'png': {
        return `data:image/${type};base64, ${data}`;
      }
      default: {
        return dataBase64 as string;
      }
    }
  }

  public static async urlToBase64(url: string): Promise<string | undefined> {
    const blob = await this.urlToBlob(url);
    const urlType = this.type(url);

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const dataBase64: string = reader.result as string;

        resolve(this.prefixBase64(dataBase64, urlType));
      };
    });
  }

  public static getMimeTypeFromBase64(dataUri: string): string {
    const match = dataUri.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,/);

    if (match && match.length >= 2) {
      return match[1];
    }

    return 'application/octet-stream';
  }

  public static base64ToBlob(dataBase64: string, type: string): Blob {
    const splitData = dataBase64.split(';base64,');
    const contentType = type || splitData[0].split(':')[1];
    const raw = window.atob(splitData[1] || splitData[0]);
    const rawLength = raw.length;

    const uInt8Array = new Uint8Array(new ArrayBuffer(rawLength));

    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
  }

  public static base64ToFile(dataBase64: string, config?: Partial<FileData>): File {
    const { fileName = 'file', lastModified } = config || {};
    const mimeType = config?.mimeType || this.getMimeTypeFromBase64(dataBase64);

    return new File([this.base64ToBlob(dataBase64, mimeType)], fileName.includes('.') ? fileName : `${fileName}.${mimeType?.split('/')[1]}`, {
      type: mimeType,
      lastModified,
    });
  }

  public static async fileToBase64(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result?.toString() ?? '');
      reader.onerror = (error) => reject(error);
    });
  }

  public static async uploadFile(options?: { accept?: Array<string>; multiple?: boolean; max?: number; folder?: boolean }): Promise<FileList> {
    const { accept, multiple, max, folder } = options || {};

    return new Promise((resolve, reject) => {
      const uploadInput: HTMLInputElement = document.createElement('input');
      uploadInput.max = max?.toString() || '';
      uploadInput.multiple = multiple || false;
      uploadInput.type = 'file';
      uploadInput.accept = (accept || ['*']).join(',');

      if (folder) {
        uploadInput.setAttribute('webkitdirectory', '');
        uploadInput.setAttribute('directory', '');
      }

      uploadInput.click();

      uploadInput.onchange = () => {
        uploadInput.remove();

        if (uploadInput?.files) {
          resolve(uploadInput?.files);
        } else {
          reject();
        }
      };

      uploadInput.onerror = () => {
        uploadInput.remove();
        reject();
      };

      uploadInput.oncancel = () => {
        uploadInput.remove();
        reject();
      };
    });
  }

  public static downloadLink(url: string, name: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    link.remove();
  }

  public static downloadBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    this.downloadLink(url, name);
    URL.revokeObjectURL(url);
  }
}
