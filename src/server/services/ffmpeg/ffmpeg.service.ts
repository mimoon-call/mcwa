// audio.service.ts
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { parseBuffer } from 'music-metadata'; // npm i music-metadata

const FFMPEG = (ffmpegPath as unknown as string) ?? 'ffmpeg';

export class AudioService {
  // ---------- low-level runner ----------
  private async runFfmpeg(input: Buffer, args: string[]): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const ff = spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      const out: Buffer[] = [];
      const err: Buffer[] = [];

      ff.stdout.on('data', (c) => out.push(c as Buffer));
      ff.stderr.on('data', (c) => err.push(c as Buffer));
      ff.on('error', reject);
      ff.on('close', (code) => {
        if (code === 0) return resolve(Buffer.concat(out));
        reject(new Error(`ffmpeg exited with ${code}: ${Buffer.concat(err).toString()}`));
      });

      ff.stdin.write(input);
      ff.stdin.end();
    });
  }

  // ---------- public helpers ----------
  /** Convert any audio buffer to MP3 (CBR) */
  async bufferToMp3(buf: Buffer, kbps = 128): Promise<Buffer> {
    const args = [
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-vn',
      '-ac',
      '2',
      '-ar',
      '44100',
      '-c:a',
      'libmp3lame',
      '-b:a',
      `${kbps}k`,
      '-f',
      'mp3',
      'pipe:1',
    ];
    return this.runFfmpeg(buf, args);
  }

  /** Convert any audio buffer to OGG/Opus (ideal for WhatsApp PTT) */
  async bufferToOpusOgg(buf: Buffer, kbps = 24, hz = 16000, channels = 1): Promise<Buffer> {
    const args = [
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-vn',
      '-ac',
      String(channels),
      '-ar',
      String(hz),
      '-c:a',
      'libopus',
      '-b:a',
      `${kbps}k`,
      '-f',
      'ogg',
      'pipe:1',
    ];
    return this.runFfmpeg(buf, args);
  }

  /** Ensure the buffer is OGG/Opus; if already Opus, return as-is */
  async ensureOpusOgg(buf: Buffer): Promise<Buffer> {
    try {
      const meta = await parseBuffer(buf, 'audio/ogg', { duration: true });
      const codec = meta?.format?.codec ?? '';
      if (/opus/i.test(codec)) return buf;
    } catch {
      /* ignore and transcode */
    }
    return this.bufferToOpusOgg(buf);
  }

  /** Extract duration in whole seconds (useful for “recording…” presence) */
  async getDurationSeconds(buf: Buffer, mimeHint = 'audio/ogg'): Promise<number | undefined> {
    try {
      const meta = await parseBuffer(buf, mimeHint, { duration: true });
      return meta.format.duration ? Math.round(meta.format.duration) : undefined;
    } catch {
      return undefined;
    }
  }

  // ---------- convenience wrappers for your original use cases ----------
  /** Multer file -> MP3 buffer */
  async multerFileToMp3(multerFile: Express.Multer.File, kbps = 128): Promise<Buffer> {
    return this.bufferToMp3(multerFile.buffer, kbps);
  }

  /** Multer file -> OGG/Opus buffer (WhatsApp PTT-ready) */
  async multerFileToOpusOgg(multerFile: Express.Multer.File, kbps = 24): Promise<Buffer> {
    return this.bufferToOpusOgg(multerFile.buffer, kbps);
  }

  /** base64 (e.g., webm/mp4/m4a) -> MP3 buffer */
  async base64ToMp3(base64: string, kbps = 128): Promise<Buffer> {
    const buf = Buffer.from(base64, 'base64');
    return this.bufferToMp3(buf, kbps);
  }

  /** base64 -> OGG/Opus buffer (PTT-ready) */
  async base64ToOpusOgg(base64: string, kbps = 24): Promise<Buffer> {
    const buf = Buffer.from(base64, 'base64');
    return this.bufferToOpusOgg(buf, kbps);
  }
}
