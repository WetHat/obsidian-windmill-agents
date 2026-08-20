import { writeFile } from "fs/promises";
import * as path from "path";

/**
 * Writes text content to a file in an Obsidian vault.
 *
 * The file is written beneath `/mnt/obsidianvaults/<vault>/<location>` and
 * named `<filename>.<extension>`.
 *
 * @param vault - Name of the Obsidian vault.
 * @param location - Relative directory within the vault. Use `./` for vault root.
 * @param filename - Base filename without its extension.
 * @param extension - File extension without the leading dot.
 * @param content - Text content to write.
 * @returns The absolute path of the written file.
 * @throws If the target file cannot be written.
 */
export async function main(
  vault: string,
  location: string,
  filename: string,
  extension: string,
  content: string): Promise<string> {

  const filePath = path.join(`/mnt/obsidianvaults/${vault}/${location}`, `${filename}.${extension}`);
  await writeFile(filePath, content);
  return filePath;
}