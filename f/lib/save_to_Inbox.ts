import { writeFile } from "fs/promises";
import * as path from "path";

const ILLEGAL = /[\/\?<>\\:\*\|":\[\]#]/g;

/**
 * Writes a file into the specified Obsidian vault's Inbox folder.
 *
 * @param {string} vault - Name of the target vault.
 * @param {string} filename - Base filename without extension.
 * @param {string} extension - File extension (e.g., "md").
 * @param {string} content - File contents to write.
 * @returns {Promise<{ path: string }>} Absolute path of the written file.
 *
 * @throws {ENOENT} If the vault or Inbox directory does not exist.
 */
export async function main(
  vault: string,
  filename: string,
  extension: string,
  content: string): Promise<{ path: string }> {

  const
    sanitizedFilename = filename
      .replace(ILLEGAL, "•")
      .replace(/'\u00A0'/g, ' '), // and non-breaking spaces (thanks @Licat)
    filePath = path.join(`/mnt/obsidianvaults/${vault}/Inbox`, `${sanitizedFilename}.${extension}`);
  await writeFile(filePath, content);
  return { path: filePath };
}