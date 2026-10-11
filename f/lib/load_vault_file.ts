import { readFile } from "fs/promises";
import * as path from "path";
import * as wmill from "windmill-client";

/**
 * Loads a vault file from the mounted Obsidian vaults root folder.
 *
 * @remarks
 * Reads the vaults root directory from the Windmill variable
 * `f/lib/obsidianvaults` and constructs the file path as
 * `<vaultsRoot>/<vault>/<location>/<filename>.<extension>` using `path.join`.
 * The file must be accessible to the worker executing this script.
 * Inputs are not validated, and path traversal is not prevented; use trusted
 * path components. The entire file is read into memory.
 *
 * @param vault - Vault directory name beneath the configured vaults root.
 * @param location - Directory within the vault; use an empty string for its root.
 * @param filename - File name without its extension.
 * @param extension - File extension without the leading dot, for example `md`.
 * @returns An object containing the supplied `filename` (without the extension)
 * and the file's UTF-8 text in `data`.
 * @throws If retrieving the vaults root variable fails or reading the file fails,
 * for example because the file is missing or the worker lacks permission.
 */
export async function main(
  vault: string,
  location: string,
  filename: string,
  extension: string = 'md'): Promise<{ filename: string, data: string }> {
  const
    vaultsRoot = await wmill.getVariable("f/lib/obsidianvaults"),
    filePath = path.join(`${vaultsRoot}/${vault}/${location}`, `${filename}.${extension}`),
    data = await readFile(filePath, {
      encoding: `utf8`,
      flag: 'r'
    });
  return {
    filename,
    data
  };
}
