import { readFile } from "fs/promises";
import * as path from "path";

export async function main(
  location: string,
  filename: string,
  extension: string

): Promise<{ filename: string, data: string }> {
  const
    filePath = path.join(`/mnt/obsidianvaults/${location}`, `${filename}.${extension}`),
    data = await readFile(filePath, {
      encoding: `utf8`,
      flag: 'r'
    });
  return {
    filename,
    data
  };
}
